# fumadocs-obsidian-md

Glue between [`remark-obsidian-md`](../remark-obsidian-md) and Fumadocs: Vault resolver, slugs, MDX options and Asset URL handling.

## Check for unparseable Frontmatter

```sh
fumadocs-obsidian-md-check [vault-dir]
```

Scans every Note (`.md` and `.mdx`, skipping dot-folders such as `.obsidian`) and names each one whose Frontmatter YAML cannot be parsed, with the parser's message. It exits non-zero if any Note fails, or if the Vault directory does not exist, and zero otherwise. Without an argument it reads `VAULT_DIR`, then falls back to `public/vault`.

Run it before the build so that a bad Note produces a readable message instead of a raw parser stack trace:

```json
{
  "scripts": {
    "build": "fumadocs-obsidian-md-check && next build"
  }
}
```

The same scan is available programmatically as `findUnparseableFrontmatter(dir)`.

## The Fumadocs patch

Fumadocs parses a Note's Frontmatter at four entry points, none of which is guarded: the bundler loader, index generation, dynamic compile and includes. They run before any supported hook, so this package cannot intercept them, and one corrupt Note fails the whole build with a stack trace.

To make a corrupt Note render as plain Markdown instead (no Frontmatter), patch `fumadocs-core`'s `frontmatter` function to catch the parse error. [`examples/fumadocs`](../../examples/fumadocs) ships this as a pnpm patch (`patches/fumadocs-core@16.17.7.patch`, registered under `patchedDependencies` in `pnpm-workspace.yaml`). The patch is tied to the exact `fumadocs-core` version, so regenerate it when you upgrade.

Without the patch the check command is your safety net: it fails the build early and names the Notes to fix. With the patch the build succeeds, so keep running the check if you want to hear about corrupt Notes rather than have them silently lose their Frontmatter.

Both the patch and the check are workarounds. When Fumadocs ships a tolerant parser (or an error hook) upstream, delete the patch, and the check command may be removed.
