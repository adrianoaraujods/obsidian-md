# Edit Notes in a CodeMirror 6 text document, not a rich-text-schema editor

The Examples edit a Note as raw Markdown in a CodeMirror 6 editor, with Live Preview decorations that render each construct until the cursor enters it. We chose this because a rich-text-schema editor re-serializes the document from its own model, which cannot meet the bar of "saving never alters Obsidian syntax and every ordinary Note opens". A text document meets it by construction: untouched text is never rewritten.

## Considered options

- **Fumadocs Editor as-is**: MDX-only pipeline, so none of our syntax is WYSIWYG. Re-serialized blocks escape `[[`, `![[`, `^[` and `> [!tip]`, and Notes containing `<br>`, `<!-- -->`, `a < b` or `<https://…>` fail to parse. It is experimental, pre-v1 and has one maintainer.
- **Fumadocs Editor with a fork or upstream PR**: dialects are a closed set with no public hook, so new syntax means maintaining a fork of a moving experimental package, and the schema conflict with "no alteration on save" remains.
- **Keystatic**: GitHub mode needs no database, but its markdown field has a closed ProseMirror schema that escapes the same constructs on save. Not viable for Notes without a fork.

## Consequences

The editor's syntax rules exist alongside those in `remark-obsidian-md`; whether to share them is a package-boundaries question. The editor reuses the plugin Stylesheet's class names (ADR 0005, ADR 0008) so Callouts and Highlights look the same while editing as on the Wiki. Persistence is not tied to the Fumadocs Editor's sync server, so the Examples need no long-lived WebSocket host unless the storage design adds one. The Fumadocs Editor has no role in the Examples.
