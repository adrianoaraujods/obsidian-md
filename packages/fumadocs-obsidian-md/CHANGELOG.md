# fumadocs-obsidian-md

## 0.2.0

### Minor Changes

- e5692ba: Add the browser-safe `fumadocs-obsidian-md/meta` subpath: `readMeta` and `writeMeta` for a folder's `meta.json` (`title`, `pages` order, `---Title---` Separators) with helpers to reorder, add, rename and remove Separators and set the title. Unknown keys and `pages` entries (links, `...folder`, `!name`, `z...a`) are preserved in place, and `createMeta` builds a first `meta.json` that ends with `"..."`.
- 6a3bb07: `fumadocs-obsidian-md/meta` gains `planMeta`, which turns staged moves, reorders, Separator edits and title changes into the `meta.json` writes and deletes that keep a folder's `pages` in sync, and the helpers it is built from: `orderChildren`, `folderRows` and `defaultOrder`.

### Patch Changes

- Updated dependencies [b402c84]
  - remark-obsidian-md@3.2.0
  - react-obsidian-md@0.1.1

## 0.1.2

### Patch Changes

- Updated dependencies [9f41b51]
- Updated dependencies [7d4c949]
  - remark-obsidian-md@3.1.1
  - react-obsidian-md@0.1.1

## 0.1.1

### Patch Changes

- Updated dependencies [d6d97d3]
- Updated dependencies [1e70f39]
  - remark-obsidian-md@3.1.0
  - react-obsidian-md@0.1.0

## 0.1.0

### Minor Changes

- 03faff6: Initial 0.1.0 release: React renderers for Obsidian Notes and a Fumadocs integration that turns a Vault into a Wiki.

### Patch Changes

- Updated dependencies [03faff6]
  - react-obsidian-md@0.1.0
