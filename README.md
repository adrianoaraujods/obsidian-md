# obsidian-md

Publish an [Obsidian](https://obsidian.md) Vault as a Wiki. This monorepo holds the packages that do it and an Example that wires them together.

## Packages

| Package | What it is |
| --- | --- |
| [`remark-obsidian-md`](packages/remark-obsidian-md) | Remark plugin that ports Obsidian's syntax (Wiki Links, Embeds, Callouts, Highlights, Comments, Block IDs) to standard MDAST. Works in any unified pipeline. |
| [`react-obsidian-md`](packages/react-obsidian-md) | Headless React components: Hover Preview and Properties Panel. No CSS of its own. |
| [`fumadocs-obsidian-md`](packages/fumadocs-obsidian-md) | Glue that publishes a Vault through Fumadocs: resolver, Slugs, MDX options, Asset URLs and the Preview Payload route. |
| [`examples/fumadocs`](examples/fumadocs) | The Example: a Next.js and Fumadocs Wiki built from the three packages. |

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

See [CONTRIBUTING.md](CONTRIBUTING.md).
