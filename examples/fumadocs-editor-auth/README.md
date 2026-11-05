# Fumadocs Editor Example (authenticated)

The [open editor Example](../fumadocs-editor) plus sign-in. Anyone can read the Wiki; signing in with GitHub allows editing. It uses [Better Auth](https://www.better-auth.com) in stateless mode (no database) and a plain GitHub OAuth App that proves identity only. Terms such as Vault, Note and Wiki are defined in [`GLOSSARY.md`](../../GLOSSARY.md); the design is in [ADR 0011](../../docs/adr/0011-codemirror-text-editor.md) onward, notably [0013](../../docs/adr/0013-github-app-user-tokens-stateless-auth.md) and [0015](../../docs/adr/0015-commit-with-a-shared-credential-name-the-editor-in-a-trailer.md).

At the moment `/edit/<slug>` is a placeholder behind the sign-in; the editor and Save land in later tickets.

## Start a Wiki

```sh
npx degit adrianoaraujods/obsidian-md/examples/fumadocs-editor-auth my-wiki
```

Then follow the [Fumadocs Example](../fumadocs/README.md#start-a-wiki) steps (install, replace the `workspace:*` versions, set `VAULT_DIR`), and the setup below.

## Set up sign-in

1. Create a GitHub OAuth App (Settings, Developer settings). Homepage: your site. Callback URL: `<BETTER_AUTH_URL>/api/auth/callback/github`. Use default scopes.
2. Copy [`.env.example`](./.env.example) to `.env.local` and set `BETTER_AUTH_SECRET` (at least 32 random characters), `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
3. `pnpm dev`, open a Note and click **Edit**. You go straight to GitHub and come back to `/edit/<slug>`.

With `GITHUB_REPO` unset, `pnpm dev` uses the local filesystem. Production refuses to start without it.

## How it behaves

- **Edit** sits in the page-actions row for everyone; the row is identical signed in or out. Signed out, it sends you to GitHub sign-in and back to the same editor route. Cancelling or being denied returns you to the read-only Note with a toast.
- The sidebar footer shows your avatar, `@login` and **Sign out**, only when signed in.
- The `/edit` route tree rejects signed-out visitors (`requireEditor` in `src/lib/auth/session.ts`, called by each page under it).
- The Wiki's pages stay static. The session is read in the browser for the account control.

### Restricting who may edit

By default any GitHub account that signs in may edit; the real gate is the credential that commits. To restrict it, uncomment the allow-list in [`src/lib/auth/policy.ts`](./src/lib/auth/policy.ts) (or check the email domain). A rejected account is sent back with the toast "This account isn't allowed to edit". There is no env-driven allow-list.

To cut everyone off, rotate `BETTER_AUTH_SECRET` (signs everyone out) or the write credential.

## Environment

Every variable is listed, with a comment, in [`.env.example`](./.env.example). The build needs none of them. They are checked together on the first request (`src/lib/env.ts`): one error lists everything missing or malformed. In production the server refuses to start without `GITHUB_REPO` (`src/instrumentation.ts`).

## Code layout

- `src/lib/env.ts`: validation (`parseEnv`, `getEnv`, `requireRepoInProduction`).
- `src/lib/auth/config.ts`: the Better Auth instance (`createAuth`). `index.ts` creates it lazily (`getAuth`); `session.ts` has `getSession` and `requireEditor`; `policy.ts` is the access hook; `client.ts` is the browser client.
- `src/app/api/auth/[...all]`: Better Auth's handler. `src/app/api/sign-in`: a GET redirect into GitHub OAuth, used by Edit.

## Tests

`pnpm test` runs Vitest and Playwright (Chromium) against the fixture Vault and a fake GitHub; see `tests/README.md`.
