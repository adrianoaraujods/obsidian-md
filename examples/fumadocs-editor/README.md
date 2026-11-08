# Fumadocs Editor Example (open)

The [Fumadocs Example](../fumadocs) plus the shell for an in-browser Note editor. It is a local-first starting point: it has no auth dependencies and saves to the local filesystem, so it cannot save when deployed. Terms such as Vault, Note and Wiki are defined in [`GLOSSARY.md`](../../GLOSSARY.md); the design is in [ADR 0011](../../docs/adr/0011-codemirror-text-editor.md) onward.

## Start a Wiki

```sh
npx degit adrianoaraujods/obsidian-md/examples/fumadocs-editor my-wiki
```

Then follow the [Fumadocs Example](../fumadocs/README.md#start-a-wiki) steps: install, replace the `workspace:*` versions and set `VAULT_DIR`.

## Page actions

A row under each Note's title offers:

- **Edit**, which opens `/edit/<slug>`. It is hidden in a production build, and so is the route (404), because a deployed Wiki cannot save to disk.
- **View on GitHub**, which opens the Note's file on the right repo and branch. It appears only when `GITHUB_REPO`, `GITHUB_BRANCH` and `VAULT_PATH` are all set.
- **Copy Markdown**, which copies the Note's source.

## The Manager

Right-click the File Tree for **Rename/Move…** on a Note and **Reorder…** on a folder or the root; they open the Manager at `/manage` (focused on that item with `?focus=<path>`). It shows the Vault as a tree: drag a Note, Asset or folder onto a folder, or use "Move to…" and "Rename"; reorder siblings by dragging or with the up and down buttons; add, rename, remove and drag Separators; edit a folder's title with "Title". Changes are staged in memory, and Apply makes one atomic commit through the filesystem adapter (`POST /api/manage`): the moves, the rewritten links and the `meta.json` changes land together or not at all. Moving a Note changes its URL, and old URLs do not redirect.

`meta.json` is created on a folder's first reorder (ending with `"..."`); keys and `pages` entries the Manager does not model are kept, and moves and renames keep the affected `pages` entries in sync. If the Vault changed on disk since the page opened, nothing is applied and you are asked to reload. The Manager reads the Vault from `VAULT_DIR` (default `public/vault`) when it is requested, not at build time.

Like Edit, the File Tree menu, `/manage` and `/api/manage` exist only outside a production build: in production the menu is not rendered and both answer 404, because a deployed Wiki cannot write to disk. There is no deploy lock here, since nothing is deployed. For a deployed Wiki that commits to GitHub, use the [authenticated Example](../fumadocs-editor-auth/README.md#the-manager).

The build also publishes each Note's raw Markdown at `/raw/<path>.md`; Copy Markdown reads it.

## Environment

Every variable is listed, with a comment, in [`.env.example`](./.env.example). Values are read at build time, except `VAULT_DIR` for the Manager and the editor's storage route, which is read from disk when requested.

## Tests

`pnpm test` runs Vitest and Playwright (Chromium). Playwright runs a production build of the fixture Vault (Edit hidden) and `next dev` (Edit available) side by side; see `tests/README.md`.
