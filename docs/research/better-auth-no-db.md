# Better Auth without a database (issue #64, map #60)

Researched 2026-11-04 against better-auth `main` @ `b6a87ad` (package `better-auth` 1.7.16) and the better-auth.com docs.

## Short answer

- **Yes, Better Auth runs with no database in Next.js.** Omit `database` (and `secondaryStorage`) and it switches to stateless mode on its own.
- **The GitHub access token lives in an encrypted cookie** (`better-auth.account_data`, JWE, chunked if large). It is not in the session cookie.
- **GitHub OAuth-app tokens do not expire** and have no refresh token, so there is nothing to refresh. GitHub Apps with expiring tokens (8h access, 6mo refresh) are refreshable through `getAccessToken`.
- **Revocation is weak.** A stolen or "signed-out-elsewhere" cookie stays valid until its embedded expiry. The only global kill switch is rotating the secret or bumping `cookieCache.version`.
- **A separate Node server can verify the session** statelessly by decrypting the `session_data` cookie with the shared `BETTER_AUTH_SECRET` (`getCookieCache` from `better-auth/cookies`). It can read the GitHub token from `account_data` with `symmetricDecodeJWT` from `better-auth/crypto`, but that is an internal format (see Risks).

## 1. Is no-database mode supported?

Docs: "Better Auth supports stateless session management without any database. If you don't pass a database configuration, Better Auth will automatically enable stateless mode." ([session-management](https://www.better-auth.com/docs/concepts/session-management); also called out on [database](https://www.better-auth.com/docs/concepts/database)).

Source, `packages/better-auth/src/context/create-context.ts` (L100-L135, L293):

- With no durable store (`hasServerSessionStore(options)` false), defaults are merged in: `session.cookieCache = { enabled: true, strategy: "jwe", refreshCache: true, maxAge: session.expiresIn || 7 days }`.
- With no `options.database`, `account.storeAccountCookie` defaults to `true` (comment: "without a primary database the account (and its OAuth tokens) only has a durable home in a cookie").
- `oauthConfig.storeStateStrategy` defaults to `"cookie"` when stateless, so the OAuth `state` payload is also an encrypted cookie, with no verification row ([options reference](https://www.better-auth.com/docs/reference/options)).
- `refreshCache` is force-disabled with a warning if a database or `secondaryStorage` is configured: "meant for stateless (DB-less) setups".

Next.js specifics: nothing special beyond the standard `toNextJsHandler(auth)` route and `nextCookies()` plugin when you call auth APIs from Server Actions. Not re-verified in this pass; check the Next.js integration page when building.

Consequence: no users table. The "user" is whatever GitHub profile was captured at sign-in, frozen into the cookie. There is no account linking across providers, no user listing, and no server-side session list.

## 2. Where the GitHub OAuth access token lives

Docs: `storeAccountCookie` "Store provider account data after an OAuth flow in an encrypted cookie" (default `false`, automatically `true` with no database) ([options](https://www.better-auth.com/docs/reference/options)).

Source (`cookies/session-store.ts` L240-L280, `cookies/index.ts` L129):

- Cookie name: `<prefix>.account_data`, default `better-auth.account_data` (`__Secure-` prefixed over HTTPS in production). Chunked into `.0`, `.1`... if over the size limit (docs: "Better Auth chunks oversized account cookies").
- `setAccountCookie` encodes the whole account object (including `accessToken`, `refreshToken`, `idToken`, expiries, scopes, `userId`) with `symmetricEncodeJWT(..., secretConfig, "better-auth-account", maxAge)`. That is JWE (A256CBC-HS512 with HKDF per the docs), so the token is **encrypted**, not merely signed.
- Cookie `maxAge` is `session.cookieCache.maxAge`, which in stateless defaults equals session `expiresIn` (7 days). The options page says "five-minute max age", which is only the fallback in `setAccountCookie` and the cookie definition when `cookieCache.maxAge` is unset. In stateless mode the default config sets it, so treat 7 days as effective, but verify by inspecting a real cookie before relying on it.
- The cookie is kept alive alongside the session: on cookie-cache refresh the account cookie is re-set when its `userId` matches the session user, and expired otherwise (`cookies/index.ts` L255-L270).
- The session cookies are separate: `session_token` (signed token, no useful payload without a DB) and `session_data` (the cached session+user, JWE by default in stateless mode).

Reading it server-side in Next.js: `auth.api.getAccessToken({ body: { providerId: "github", useAccountCookie: true }, headers })`. `useAccountCookie: true` is the explicit selector that makes the endpoint use the cookie instead of a DB row (`api/routes/account.ts` L575-L650).

Security notes: the token is only as safe as the cookie (HttpOnly, Secure, SameSite=Lax defaults) and `BETTER_AUTH_SECRET`. Anyone with the secret can decrypt every user's GitHub token. Request the minimal GitHub scope (`repo` or `public_repo`; add via `socialProviders.github.scope`). The docs say the `user:email` scope is required for the GitHub provider ([GitHub provider](https://www.better-auth.com/docs/authentication/github)).

## 3. Expiry and refresh

GitHub side:

- Better Auth docs: GitHub "doesn't issue refresh tokens for OAuth apps. Access tokens stay valid indefinitely unless the user revokes them, the app revokes them, or they go unused for a year."
- GitHub docs: expiring tokens are opt-in for OAuth apps (via the `offline_access` scope) and on by default for new GitHub Apps: "The user access token expires after eight hours, and the refresh token expires after six months" ([refreshing user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens), [best practices](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app)).

Better Auth side (`api/routes/account.ts` L690-L745): `getAccessToken` refreshes only when the account has a `refreshToken`, an `accessTokenExpiresAt` within 5s of now, and the provider implements `refreshAccessToken` (the GitHub provider wires one in, `core/src/social-providers/github.ts` L123). On refresh it writes the new tokens back to the account cookie when `storeAccountCookie` is on. Docs: "Token refresh responses set an updated account cookie".

Implications:

- **OAuth App (recommended for this project):** no expiry, no refresh. Lifetime of write access is bounded by the Better Auth session (7 days by default) because the token is only reachable via the cookie. After the cookie expires the user signs in again (GitHub usually auto-approves).
- **GitHub App with expiring tokens:** works, refresh is automatic on `getAccessToken`, but refresh can only persist on a request that can set cookies (a route handler or Server Action, not a Server Component render), and a separate Node server cannot write the refreshed token back into the browser cookie.

Session lifetime (stateless): `refreshCache: true` re-issues the cookie when 20% of `maxAge` remains (docs; `updateAge = floor(maxAge * 0.2)` in source). The refreshed payload spreads the old `session.session`, so the embedded `expiresAt` is **not extended** (`api/routes/session.ts` L205-L215, my reading of the code), and `getCookieCache` rejects payloads whose `session.expiresAt` has passed. Net effect: a hard ~7-day session regardless of activity. Verify empirically before promising sliding sessions.

## 4. Revocation limits

Docs: "One of the biggest drawbacks of stateless sessions is that you can't invalidate session easily." and "revoked sessions may remain active on other devices until the cookie cache expires (`maxAge`)."

- Sign-out clears the cookies on that browser only. A copied cookie remains valid until its expiry.
- Global invalidation: change `session.cookieCache.version` (string or function of session/user) and redeploy, or rotate `BETTER_AUTH_SECRET`. Per-user revocation is possible only with a `version` function reading an external source, which a DB-less setup does not have.
- Revoking at GitHub (user deauthorizes the app) does not log the user out of Better Auth; it makes the stored token fail at the GitHub API (401), which the app must handle by forcing re-login.
- Mitigation if needed: shorten `expiresIn`/`maxAge` (trade-off: more re-logins), or add `secondaryStorage` (this turns stateful mode on and disables `refreshCache`).

## 5. Verifying the session from a separate Node server

Target: the sync server's `authenticate(request)` (Fumadocs Editor hook) runs outside Next.js but receives the browser's cookies (same site or parent domain, or the cookie forwarded explicitly).

Option A, supported API: `getCookieCache(request | headers, { secret, strategy: "jwe", cookiePrefix, isSecure, version })` from `better-auth/cookies` (source `cookies/index.ts` L617-L735). It reads `session_data` (reassembling chunks), decrypts with the shared secret (no network, no DB), checks `version` and the embedded `session.expiresAt`, and returns `{ session, user, ... }` or `null`. Requirements:

- Same `BETTER_AUTH_SECRET` on both servers.
- Pass `strategy` matching the config (`"jwe"` in stateless default); the function defaults to `"compact"`.
- Cookie name must match: `isSecure`/prefix (`__Secure-` over HTTPS) and any custom `cookiePrefix`.
- The cookie must actually reach the Node server (same registrable domain, `Domain` attribute via `advanced.crossSubDomainCookies`, and CORS credentials), otherwise forward it.
- Only identity is available (GitHub user id, name, email, image as captured at sign-in). Freshness is bounded by `maxAge`, and there is no revocation check (section 4).

Option B, strategy `"jwt"` instead of `"jwe"`: `getCookieCache` supports `jwt: { jwks, issuer, audience }`, so a verifier can validate with a public JWKS and never hold the encryption secret (source L708-L726). The payload is then signed, not encrypted, which is fine for user info. This applies to `session_data` only. Whether a JWKS-signed cookie cache is configurable without the `jwt` plugin was not verified here.

Option C, call back into Next.js: the Node server forwards the request's `cookie` header to `GET /api/auth/get-session` on the Next app. No secret sharing, one extra hop per `authenticate` call, and always correct with respect to Better Auth's own logic.

Getting the GitHub token on the Node server: it is in `account_data`, not `session_data`. Either (a) decrypt it with `symmetricDecodeJWT(cookie, secret, "better-auth-account")` from `better-auth/crypto` (the salt string `"better-auth-account"` and the format are internal, not documented API), or (b) have the Next.js app do the commit using `getAccessToken({ useAccountCookie: true })` and keep the token away from the Node server entirely. (b) is the safer boundary: the sync server then only needs identity.

## Risks and open questions for the design

1. `account_data` decoding by a foreign server relies on undocumented internals; pin the `better-auth` version or prefer option C / (b).
2. Cookie size: GitHub profile + token in JWE, chunked; fine for GitHub (opaque tokens), problematic for providers with large JWTs (docs advise a DB-backed account there).
3. The stateless cookie is a bearer credential with write access to a repo for up to 7 days and cannot be revoked per user. Consider a shorter `expiresIn` for the authenticated Example and the narrowest scope.
4. Sliding vs absolute session lifetime: derived from code reading, should be tested.
5. Not checked: Next.js `nextCookies()` details, and whether the Fumadocs sync server passes cookies or only an `Authorization` header to `authenticate`. A Bearer-style flow would need the `bearer` plugin, which relies on the session token and so likely does not work DB-less; confirm in the Fumadocs Editor docs.
