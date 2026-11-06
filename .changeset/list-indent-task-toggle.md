---
"codemirror-obsidian-md": minor
---

`editingShortcuts` now indents lists and toggles tasks: Tab and Shift-Tab indent and unindent a list item and renumber numbered items (gated by `listContinuation`, and not intercepted outside a list or inside fenced code, so focus can leave the editor), `Mod-]` and `Mod-[` indent and unindent the selected lines, and `Mod-Enter` toggles a task. The `indent`, `unindent` and `toggleTask` keys are rebindable by name.
