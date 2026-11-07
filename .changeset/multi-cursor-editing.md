---
"codemirror-obsidian-md": minor
---

Add multi-cursor editing to `createEditor`: Alt-click (Option on macOS) adds a cursor, Shift-Alt-drag or a middle-mouse drag selects a rectangle, Ctrl-Alt-Up/Down adds a cursor above or below, and Escape collapses to one. The editor now draws its own cursor and selection, and the `[[` picker stays closed with several cursors.
