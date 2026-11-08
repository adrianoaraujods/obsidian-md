# Fumadocs Editor Example (open)

The [Fumadocs Example](../fumadocs) plus the shell for an in-browser Note editor. It is a local-first starting point: it has no auth dependencies and, once the editor lands, saves to the local filesystem, so it cannot save when deployed. Terms such as Vault, Note and Wiki are defined in [`GLOSSARY.md`](../../GLOSSARY.md); the design is in [ADR 0011](../../docs/adr/0011-codemirror-text-editor.md) onward.

At the moment `/edit/<slug>` is a placeholder.

## Start a Wiki

```sh
npx degit adrianoaraujods/obsidian-md/examples/fumadocs-editor my-wiki
```

Then follow the [Fumadocs Example](../fumadocs/README.md#start-a-wiki) steps: install, replace the `workspace:*` versions and set `VAULT_DIR`.

## Page actions

A row under each Note's title offers:

- **Manager** at `/manage` (development only, like Edit). It shows the Vault as a tree; drag a Note onto a folder, or use "Move to…" and "Rename". Changes are staged in memory and Apply makes one commit through the filesystem adapter (`POST /api/manage`). Moving a Note changes its URL and old URLs do not redirect. Links to a moved Note are not rewritten yet.
- **Edit**, which opens `/edit/<slug>`. It is hidden in a production build, and so is the route (404), because a deployed Wiki cannot save to disk.
- **View on GitHub**, which opens the Note's file on the right repo and branch. It appears only when `GITHUB_REPO`, `GITHUB_BRANCH` and `VAULT_PATH` are all set.
- **Copy Markdown**, which copies the Note's source.

The build also publishes each Note's raw Markdown at `/raw/<path>.md`; Copy Markdown reads it.

## Environment

Every variable is listed, with a comment, in [`.env.example`](./.env.example). Values are read at build time.

## Tests

`pnpm test` runs Vitest and Playwright (Chromium). Playwright runs a production build of the fixture Vault (Edit hidden) and `next dev` (Edit available) side by side; see `tests/README.md`.
