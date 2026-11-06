---
"codemirror-obsidian-md": minor
---

`editingShortcuts` now auto-pairs: typing `(`, `[`, `{`, `"`, `'` or `` ` `` with nothing selected inserts the closer too, a typed closer steps over an identical next character, and Backspace on an empty pair deletes both. Quotes do not pair after a word character, and `*`, `_`, `~`, `=` never pair. Typing `[[` gives `[[]]` and opens the `[[` picker. It applies at every cursor, is skipped during IME composition, and is switched off with `autoPair: false` (or only the `[[` close with `wikiLinkAutoClose: false`).
