---
"remark-obsidian-md": minor
---

Add a browser-safe `remark-obsidian-md/syntax` entry with the plugins, micromark extensions, node types and pure helpers, and no Node built-ins; the main entry re-exports it. Wiki Links, Embeds, Highlights, Footnotes and Callouts now carry source positions that cover their raw syntax, and a Block ID's range is exposed on `data.blockId`.
