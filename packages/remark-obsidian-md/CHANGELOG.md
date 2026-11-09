# remark-obsidian-md

## 3.2.0

### Minor Changes

- b402c84: `planReorganization` also rewrites the links a move or rename would break: Wiki Links, Embeds, Block References, Markdown links and Frontmatter links, keeping Alias, Subpath and path style. It takes the Notes' text and returns the `write` changes, a link count per Note and the URLs that change. `remark-obsidian-md/syntax` now exports `splitFrontmatter`.

## 3.1.1

### Patch Changes

- 9f41b51: Give each node nested in a Highlight or an inline Footnote the position of its own source, instead of the whole content range.

## 3.1.0

### Minor Changes

- d6d97d3: Add a browser-safe `remark-obsidian-md/syntax` entry with the plugins, micromark extensions, node types and pure helpers, and no Node built-ins; the main entry re-exports it. Wiki Links, Embeds, Highlights, Footnotes and Callouts now carry source positions that cover their raw syntax, and a Block ID's range is exposed on `data.blockId`.
- 1e70f39: Export `resolveCalloutType` from `remark-obsidian-md/syntax`, the pure helper that resolves a Callout marker's type, icon, color and default title, so editors share it with the renderer.
