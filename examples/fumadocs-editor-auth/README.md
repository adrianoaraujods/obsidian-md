# Fumadocs Editor Example (authenticated)

The [open editor Example](../fumadocs-editor) plus sign-in. Anyone can read the Wiki; signing in with GitHub allows editing. It uses [Better Auth](https://www.better-auth.com) in stateless mode (no database) and a plain GitHub OAuth App that proves identity only. Terms such as Vault, Note and Wiki are defined in [`GLOSSARY.md`](../../GLOSSARY.md); the design is in [ADR 0011](../../docs/adr/0011-codemirror-text-editor.md) onward, notably [0013](../../docs/adr/0013-github-app-user-tokens-stateless-auth.md) and [0015](../../docs/adr/0015-commit-with-a-shared-credential-name-the-editor-in-a-trailer.md).

At the moment `/edit/<slug>` is a placeholder behind the sign-in; the editor and Save land in later tickets.

## Start a Wiki

```sh
npx degit adrianoaraujods/obsidian-md/examples/fumadocs-editor-auth my-wiki
```

Then follow the [Fumadocs Example](../fumadocs/README.md#start-a-wiki) steps (install, replace the `workspace:*` versions, set `VAULT_DIR`), and the checklist below.

## Set up the editor

Allow a few minutes. Do these in order.

1. **Create a GitHub OAuth App** (Settings, Developer settings, OAuth Apps). Homepage: your site. Callback URL: `<BETTER_AUTH_URL>/api/auth/callback/github`. Keep the default scopes: sign-in only proves who someone is. Generate a Client secret.
2. **Create the write credential.** Every Save, create or delete is committed by this one server-side credential, which names the signed-in person in the commit body (ADR 0015). Pick one:
   - a fine-grained personal access token with Contents read and write on the Vault's repo only (`GITHUB_TOKEN`); or
   - a GitHub App installed on that repo only, with Contents read and write (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`). It wins if both are set.
3. **Set the environment variables.** Copy [`.env.example`](./.env.example) to `.env.local` for local use, and set the same names on your host. You need `BETTER_AUTH_SECRET` (at least 32 random characters), `BETTER_AUTH_URL` (the site's origin), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REPO` (`owner/name`), the credential, and `VAULT_PATH` (the Vault's folder inside the repo, e.g. `public/vault`). `GITHUB_BRANCH` defaults to the repo's default branch; set it to the branch the Wiki deploys from if that differs.
4. **Deploy.** The Vault must live in the same repo as the app, so each commit is a redeploy. See the Vercel walkthrough below.
5. **Check the first sign-in.** Open a Note and click **Edit**. You go to GitHub, authorise, and come back to `/edit/<slug>`. If a variable is missing or malformed, the first request shows one error listing all of them.

Locally, `pnpm dev` with `GITHUB_REPO` unset uses the local filesystem, so only the OAuth App and the four sign-in variables are needed to try it. Production refuses to start without `GITHUB_REPO`.

### Deploy on Vercel

1. Import the repo. If the Example is in a subfolder, set **Root Directory** to it.
2. Add the variables from step 3 under Settings, Environment Variables. `BETTER_AUTH_URL` is your production origin; use the same origin in the OAuth App's callback URL. The build needs no secrets.
3. Deploy. After a Save, the editor locks that Note until the deployed build is at or after the saved commit, polling `GET /api/build`. That route is uncached (`force-dynamic`, `cache-control: no-store`) and returns `{ "sha": "<commit>" }`, taken from Vercel's `VERCEL_GIT_COMMIT_SHA`. Do not put a cache in front of it.
4. Hobby note: Vercel's Hobby plan may refuse to deploy commits whose author is not the project's owner. Commits are authored by the credential's account, so a personal access token created by the repo owner avoids it; a GitHub App's bot author may be refused.

On another host, expose the build's commit SHA the same way: `/api/build` reads `VERCEL_GIT_COMMIT_SHA`, else the local checkout's HEAD. If neither is available it returns `{ "sha": null }`, and the editor shows a one-time notice instead of locking.

## How it behaves

- **Edit** sits in the page-actions row for everyone; the row is identical signed in or out. Signed out, it sends you to GitHub sign-in and back to the same editor route. Cancelling or being denied returns you to the read-only Note with a toast.
- The sidebar footer shows your avatar, `@login` and **Sign out**, only when signed in.
- The `/edit` route tree rejects signed-out visitors (`requireEditor` in `src/lib/auth/session.ts`, called by each page under it).
- The Wiki's pages stay static. The session is read in the browser for the account control.

### Restricting who may edit

By default any GitHub account that signs in may edit, so any signed-in account can commit through your credential. Restriction is yours to add through Better Auth hooks, with no database. [`src/lib/auth/config.ts`](./src/lib/auth/config.ts) wires a `databaseHooks.user.create.before` hook that calls `canEdit` in [`src/lib/auth/policy.ts`](./src/lib/auth/policy.ts); returning `false` rejects the sign-in. Uncomment the login allow-list stub there, or check `email` against a domain or a block list. A rejected account is sent back to the read-only Note with the toast "This account isn't allowed to edit". There is no env-driven allow-list and no rate limiting.

### Revoking access

Sessions are stateless cookies, so one user cannot be signed out individually. To cut everyone off, rotate `BETTER_AUTH_SECRET`. To stop all commits, revoke or rotate the write credential (the token, or the GitHub App's key or installation). To keep one person out from now on, block their login in `policy.ts` and redeploy; their existing session stays valid until the secret is rotated.

### Reverting abusive commits

Every edit is an ordinary commit with the subject `Update|Create|Delete <path>` and a body of `Edited-with: obsidian-md editor` and `Edited-by: Name (@login)`, built on the server from the verified session. Find one account's commits by searching the history for its `Edited-by` trailer (`git log --grep "Edited-by:.*@login"`) and undo them with `git revert <sha>`; the push redeploys the Wiki.

## Environment

Every variable is listed, with a comment, in [`.env.example`](./.env.example). The build needs none of them. They are checked together on the first request (`src/lib/env.ts`): one error lists everything missing or malformed. In production the server refuses to start without `GITHUB_REPO` (`src/instrumentation.ts`).

## Code layout

- `src/lib/env.ts`: validation (`parseEnv`, `getEnv`, `requireRepoInProduction`).
- `src/lib/auth/config.ts`: the Better Auth instance (`createAuth`). `index.ts` creates it lazily (`getAuth`); `session.ts` has `getSession` and `requireEditor`; `policy.ts` is the access hook; `client.ts` is the browser client.
- `src/app/api/auth/[...all]`: Better Auth's handler. `src/app/api/sign-in`: a GET redirect into GitHub OAuth, used by Edit.

## Tests

`pnpm test` runs Vitest and Playwright (Chromium) against the fixture Vault and a fake GitHub; see `tests/README.md`.
