---
"codemirror-obsidian-md": minor
---

Add the opt-in `editingShortcuts(options?)` extension (from `codemirror-obsidian-md/editor`). `Mod-b` and `Mod-i` toggle bold and italic at every cursor, detecting `**`/`__` and `*`/`_`, and insert an empty pair when nothing is selected. Keys are rebound or disabled by command name (`bold`, `italic`, `link`, `indent`, `unindent`, `toggleTask`) and merge over Obsidian's defaults; nothing fires during IME composition.
