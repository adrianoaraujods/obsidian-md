# remark-obsidian-md

## 3.1.0

### Minor Changes

- d6d97d3: Add a browser-safe `remark-obsidian-md/syntax` entry with the plugins, micromark extensions, node types and pure helpers, and no Node built-ins; the main entry re-exports it. Wiki Links, Embeds, Highlights, Footnotes and Callouts now carry source positions that cover their raw syntax, and a Block ID's range is exposed on `data.blockId`.
- 1e70f39: Export `resolveCalloutType` from `remark-obsidian-md/syntax`, the pure helper that resolves a Callout marker's type, icon, color and default title, so editors share it with the renderer.
