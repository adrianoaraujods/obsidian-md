# The editor reuses the remark plugin as its parser

`codemirror-obsidian-md` finds our constructs (Wiki Link, Embed, Highlight, Comment, Footnote, Callout, Block ID) by parsing the Note text with `remark-obsidian-md` and building Live Preview decorations from the MDAST positions. It does not reimplement them as Lezer grammar extensions.

- The editor builds `unified().use(remarkParse).use(remarkGfm).use(remarkObsidianMd)` and walks node positions. The plugin gains exports and position fixes, not a parallel parse API.
- New syntax is added to the plugin first; the editor gets it by upgrading.
- Only the grammar and pure helpers (`parseWikiLink`, `slugify`, Callout Type, Highlight Color) are shared. The resolver stays injected through props (ADR 0003).
- `remark-obsidian-md` is a `peerDependency` of the editor package, so an Example installs one copy shared with `fumadocs-obsidian-md` and the editor and the Wiki parse alike.
- The plugin gets a browser-safe subpath, `remark-obsidian-md/syntax`, holding the micromark/MDAST code and pure helpers. Node-only code (`resolver.ts`, `property-types.ts`) stays out of it. The main entry re-exports it, so existing imports keep working.
- The editor re-parses the whole Note on change, debounced to idle, mapping existing decorations through edits meanwhile.

## Considered options

- **Lezer extensions per construct**: incremental and fast, but every construct lives twice in two grammar systems. Nested cases (tables, Callout bodies, nested Highlights) drift apart, which breaks the Live Preview guarantee that saving never alters syntax.
- **A purpose-built `parseConstructs` API in the plugin**: a second public contract to version, when the MDAST already is one.

## Consequences

The editor's client bundle carries `unified`, `micromark` and our extensions; it is loaded only on the edit route, with no size budget. A plugin major is a coordinated change with the editor. Large Notes may lag under whole-Note re-parsing; per-block re-parsing is the escape hatch.
