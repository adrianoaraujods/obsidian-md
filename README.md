# obsidian-md

Publish an [Obsidian](https://obsidian.md) Vault as a Wiki. This monorepo holds the packages that do it and Examples that wire them together.

## Packages

| Package                                                     | What it is                                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`remark-obsidian-md`](packages/remark-obsidian-md)         | Remark plugin that ports Obsidian's syntax (Wiki Links, Embeds, Callouts, Highlights, Comments, Block IDs) to standard MDAST. Works in any unified pipeline. |
| [`react-obsidian-md`](packages/react-obsidian-md)           | Headless React components: Hover Preview and Properties Panel. No CSS of its own.                                                                            |
| [`fumadocs-obsidian-md`](packages/fumadocs-obsidian-md)     | Glue that publishes a Vault through Fumadocs: resolver, Slugs, MDX options, Asset URLs and the Preview Payload route.                                        |
| [`codemirror-obsidian-md`](packages/codemirror-obsidian-md) | CodeMirror 6 editor for Notes with Live Preview, plus the storage interface it saves through. In progress.                                                   |

## Examples

| Example                                                          | What it is                                                                                                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`examples/fumadocs`](examples/fumadocs)                         | A Next.js and Fumadocs Wiki built from the three publishing packages. Read-only.                                                                          |
| [`examples/fumadocs-editor`](examples/fumadocs-editor)           | The same Wiki plus an in-browser Note editor that saves to the local filesystem. Local-first; it cannot save when deployed.                               |
| [`examples/fumadocs-editor-auth`](examples/fumadocs-editor-auth) | The editor with GitHub sign-in (Better Auth, no database). Each Save is one commit to the Vault's repo. Its README has the "Set up the editor" checklist. |

The reasoning behind the split is in [ADR 0010](docs/adr/0010-monorepo-and-package-split.md); terms are defined in the [glossary](GLOSSARY.md).

## Start a Wiki

Copy the Example, then point it at your Vault:

```sh
npx degit adrianoaraujods/obsidian-md/examples/fumadocs my-wiki
cd my-wiki
# replace the workspace:* versions in package.json with the published ones
pnpm install
VAULT_DIR=/path/to/vault pnpm dev
```

See [`examples/fumadocs`](examples/fumadocs) for the Vault layout and options.

## Developing

```sh
pnpm install
pnpm lint && pnpm build && pnpm test   # runs across every package
```

The Examples consume each package's built `dist/`, not its source. After editing a package, run `pnpm build` at the repo root (or `pnpm build` in that package) before running an Example's `pnpm dev`, or the Example runs stale code.

See [CONTRIBUTING.md](CONTRIBUTING.md).
