---
"codemirror-obsidian-md": minor
---

`editingShortcuts` now handles links. `Mod-k` turns the selection into `[selection]()` with the cursor in the parentheses, or inserts `[]()` with the cursor in the brackets, and stops the event from reaching the page so a host's global `Mod-k` (such as the Fumadocs search) does not also fire. With `pasteUrlAsLink` (on by default), pasting an http(s) URL over selected text makes `[text](url)`. Both apply at every cursor, are skipped during IME composition, and `Mod-k` is rebound or disabled through `keys.link`.
