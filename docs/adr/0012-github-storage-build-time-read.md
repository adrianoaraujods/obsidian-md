# Read the Wiki at build time, edit through GitHub, and let each commit be the deploy

In the authenticated Example the Vault lives in the app's own GitHub repo (a configurable subdirectory, `content/` by default). The published Wiki and a raw `.md` export of each Note are built from the Vault at build time, exactly as in the first Example. The editor never reads the build: when a Note opens it loads the live file and its blob SHA from the GitHub API, and Save writes one commit per Note through the Contents API using the signed-in user's token. Every Save is therefore also a redeploy, which is how the published Wiki catches up.

## Considered options

- **Read Notes from GitHub at runtime**: needs a runtime MDX compile path (`fumadocs-mdx` is build-time), spends API rate limit on every request, and fails for visitors if the repo is private. Rejected for the MVP.
- **Edit the build-time copy**: the copy can be stale and carries no blob SHA, so a write could silently overwrite newer commits. Rejected: the editor reads live from GitHub and the SHA check turns a stale write into a 409.
- **Separate Vault repo**: matches how most Obsidian Vaults are kept, but needs a webhook or other trigger to rebuild the Wiki. Still possible through the repo, branch and subdirectory env vars; the rebuild trigger is left open.
- **Sync server or WebSocket host** (Fumadocs Editor's model): not needed. Everything is a Next.js route handler, so the Example runs on serverless hosting.

## Consequences

Persistence goes through a small storage interface (`read`, `write`) that the editor takes as a prop. The open Example wires a dev-only local-filesystem adapter, so a deployed open Wiki cannot persist edits; the authenticated Example wires the GitHub adapter. A private repo works because the build and the signed-in user's token both have access.

Save asks for confirmation in an AlertDialog that says what will be committed, then locks that Note in the editor until the deployed build reports a commit at or after the saved one (the build stamps its source commit SHA where the editor can poll it). After a timeout the editor offers "Reload from GitHub" and unlocks. The lock is a UX choice, not the overwrite guard; the SHA check is.

Each Save is one commit, so a Vault with frequent saves means frequent deploys. Creating, renaming and deleting Notes would need the Git Data API and are not decided here.
