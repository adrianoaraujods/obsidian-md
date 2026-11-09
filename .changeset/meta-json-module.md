---
"fumadocs-obsidian-md": minor
---

Add the browser-safe `fumadocs-obsidian-md/meta` subpath: `readMeta` and `writeMeta` for a folder's `meta.json` (`title`, `pages` order, `---Title---` Separators) with helpers to reorder, add, rename and remove Separators and set the title. Unknown keys and `pages` entries (links, `...folder`, `!name`, `z...a`) are preserved in place, and `createMeta` builds a first `meta.json` that ends with `"..."`.
