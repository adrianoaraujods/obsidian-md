---
"codemirror-obsidian-md": minor
---

Add the editor core: `createEditor` mounts a CodeMirror 6 editor on a Note's raw Markdown, re-parses it with the `remark-obsidian-md` pipeline debounced to idle, and exposes per-construct decoration providers and a cursor-reveal helper (`codemirror-obsidian-md/editor`). Saving returns exactly the document text.
