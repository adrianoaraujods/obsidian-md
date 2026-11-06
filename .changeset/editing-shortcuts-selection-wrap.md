---
"codemirror-obsidian-md": minor
---

`editingShortcuts` now wraps a selection when you type `*`, `_`, `` ` ``, `~`, `=`, `[`, `(`, `{`, `"` or `'` over it, leaving the inner text selected so a repeat nests (`*` twice gives `**x**`). Each wrap is its own undo step and applies at every cursor. Switch it off with `selectionWrap: false`; it is skipped during IME composition.
