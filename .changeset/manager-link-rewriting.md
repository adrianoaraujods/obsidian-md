---
"remark-obsidian-md": minor
"codemirror-obsidian-md": minor
---

`planReorganization` also rewrites the links a move or rename would break: Wiki Links, Embeds, Block References, Markdown links and Frontmatter links, keeping Alias, Subpath and path style. It takes the Notes' text and returns the `write` changes, a link count per Note and the URLs that change. `remark-obsidian-md/syntax` now exports `splitFrontmatter`.
