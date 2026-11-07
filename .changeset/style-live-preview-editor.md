---
"codemirror-obsidian-md": minor
---

Add an opt-in editor Stylesheet, `codemirror-obsidian-md/styles.css`, driven by `--obsidian-editor-*` CSS variables with defaults. It styles headings (Obsidian's Live Preview scale, with the `#` markers dimmed on the cursor line), emphasis, code, quotes, lists, task checkboxes, Wiki Links, Embeds and the `[[` picker, draws a visible cursor and selection, keeps lines with widgets one line tall and renders a Callout as one box. The package holds no dark-mode logic: map the variables to your own tokens, under `.dark` too. `createEditor` and `calloutEmbed` no longer inject any theme. Providers now mark raw syntax revealed under the cursor with `cm-obsidian-*-raw` classes (Wiki Link, Highlight, Comment, inline Footnote, Block ID) and the heading `#` markers with `cm-obsidian-heading-mark`.
