# Sign in with a GitHub App, commit as the user, keep Better Auth stateless

> **Superseded in part by [ADR 0015](0015-commit-with-a-shared-credential-name-the-editor-in-a-trailer.md).** Commit identity changed: Saves are committed by one shared server-side credential, not the signed-in user's token, and sign-in is plain GitHub OAuth with no repo scope. The stateless Better Auth setup, the no-database decision and the no-separate-server decision still stand.

The authenticated Example uses Better Auth with no database and a GitHub App as the social provider. Anyone can read the Wiki; the editor requires sign-in. Whoever signs in commits as themselves with their own GitHub App user token, and GitHub decides whether they may: a user without push access to the Vault repo gets a 403 on Save. There is no allow-list in the app.

The GitHub App is installed on the Vault repo only, with the Contents read/write permission, so a token can reach nothing else. Better Auth runs in stateless mode (no `database`, no `secondaryStorage`): the session and the encrypted account data, including the user token, live in cookies. The token is read server-side in the Save and load route handlers.

## Considered options

- **Env allow-list of logins**: a second gate that needs a redeploy to change and duplicates what GitHub already enforces. Rejected; it can be added by a copier on top.
- **Bot or App installation token committing for everyone**: needs a stored secret that can write, makes every commit look like the bot, and moves authorization into our code. Rejected.
- **OAuth App**: simpler, but its `repo` scope reaches all of the user's repositories, too broad for a template people copy. Rejected.

## Consequences

User tokens expire (8 hours). They are refreshed through Better Auth in route handlers, where cookies can be set. If GitHub answers 401, the editor sends the user back to sign-in and keeps their unsaved text in the page. Stateless cookies cannot be revoked individually: to cut off a user, remove their access to the repo or uninstall the App; to cut off everyone, rotate `BETTER_AUTH_SECRET`. The Example documents this and does not engineer around it.

Committing happens from the Next.js app, not a separate server, because decoding the token elsewhere depends on undocumented Better Auth internals. Setting up the GitHub App (callback URL, permissions, installation, env vars) is a manual step every copier does once.
