# Fumadocs Editor vs Obsidian syntax (issue #62, map #60)

Researched 2026-11-04. Versions tested: `@fumadocs-editor/core@0.5.0` from npm (repo `ui@0.7.0`, `studio@0.3.0`; source cloned at `a1de121`, 2026-11-01). The project calls itself **experimental** with "breaking changes expected" (repo README).

Sources: editor.fumadocs.dev `/syntax`, `/components`, `/extensions`; github.com/fuma-nama/fumadocs-editor (`packages/core/src/mdast/parse.ts`, `mdast/from-mdast.ts`, `mdast/to-mdast.ts`, `extensions/`, `syntax/`, `sync/tree.ts`); this repo's `GLOSSARY.md` and `packages/remark-obsidian-md/README.md`. Empirical results: `docs/research/fumadocs-editor-roundtrip/` (`rt.mjs`, `out.txt`).

## Short answer

- The editor is an **MDX-only pipeline**. It parses with micromark `mdxjs()` + GFM + YAML frontmatter, not a remark plugin chain. It does not use unified/remark plugins, so `remark-obsidian-md` cannot be dropped in.
- **Unsupported constructs are preserved byte-for-byte as long as the block is untouched** (snapshot-based serializer). None of our Obsidian constructs is WYSIWYG today.
- **Once a block is edited, it is re-serialized from the ProseMirror doc, and Obsidian syntax inside it is corrupted** (escaped to `\[\[...]]`, or callout/comment structure flattened). This is the main risk.
- Plain `.md` files are listed and synced, but are parsed with the **MDX** grammar. A normal Obsidian note with `<`, `<br>`, `<!-- -->` or `<https://...>` fails to parse (throws).
- Extension routes: dialects (closed, in-repo), component specs (JSX/MDX only), TipTap extensions (decorations/shortcuts only, no new nodes or marks). A new inline/block syntax needs an **upstream PR or fork**.

## Construct table

"Verbatim" = parse then serialize unmodified, via snapshot, byte-identical. "Edited" = the block is re-serialized from the doc (simulated with `serializeDocToMdx(doc, undefined)`). All rows tested with default syntax; the math + `admonitionSpec` syntax gave the same results except where noted.

| Obsidian construct | Editor behavior | Verbatim (untouched) | Edited block | Notes |
|---|---|---|---|---|
| Wiki Link `[[N]]`, `[[N#H\|alias]]` | Unknown: plain text | identical | **corrupt**: `\[\[N]]` | Same for non-ASCII targets and `\|` in tables |
| Embed `![[N]]`, `![[img\|200]]` | Unknown: plain text, no image | identical | **corrupt**: `!\[\[N]]` | |
| Highlight `==x==` | Unknown: plain text | identical | identical (no escaping) | Survives only because `=` is not escaped; no visual highlight |
| Highlight Color (emoji prefix) | Unknown: plain text | identical (not separately tested; same path as Highlight) | likely identical | Untested |
| Callout `> [!tip] T` | Unknown: renders as plain blockquote | identical | **corrupt**: `> \[!tip] Title Body text` (lines merged, bracket escaped) | Fold marker `-` also kept as text |
| Comment inline `%%x%%` | Unknown: plain text | identical | identical | |
| Comment block (multi-line `%%`) | Unknown: paragraph | identical | **corrupt**: collapsed to `%% hidden block %%` | Newlines lost |
| Inline Footnote `^[x]` | Unknown: plain text | identical | **corrupt**: `^\[x]` | |
| Reference footnote `[^1]` + def | Kept verbatim (inline `verbatimInline` + block `verbatim`) | identical | identical | Docs: footnotes "kept verbatim and aren't yet editable" |
| Block ID `^id` | Unknown: plain text | identical | identical | |
| Frontmatter / Properties | **Dedicated `frontmatter` node** (YAML), edited as source | identical | identical | Only `yaml`; no Properties UI. Docs call out frontmatter as supported |
| `#tag` | Plain text | identical | identical | |
| Task list `- [x]` | **WYSIWYG** (`taskList`) | identical | identical | GFM |
| GFM table with Wiki Link | WYSIWYG table, link is text | identical | **corrupt** (cell: `\[\[X]]`; also column padding rewritten) | |
| Math `$..$`, `$$..$$` | WYSIWYG with KaTeX **only when `math: true`**; off by default | identical | identical | Off by default because `$5 and $10` would become a formula; with it on, `costs $5 and $10` parses as `mathInline` (verbatim still identical, but it would render as a formula) |
| Mermaid fence | WYSIWYG code block plus diagram preview | identical | identical | |
| `{braces}` in prose | Parsed as MDX expression node | identical | identical | In an Obsidian note this is plain text; invalid JS inside braces would throw |
| `<!-- html comment -->` | **Parse error (whole doc fails)** | n/a | n/a | MDX forbids it |
| `a < b`, `1<2` | **Parse error** | n/a | n/a | |
| `line<br>` (unclosed) | **Parse error** | n/a | n/a | MDX needs `<br />` |
| `<https://x>` autolink | **Parse error** | n/a | n/a | |

Count: 0 constructs of ours WYSIWYG; 1 (frontmatter) has a native node but no Properties UI; the rest are plain text that is safe only until edited.

## Plain `.md` support

- `packages/core/src/sync/tree.ts`: `MARKDOWN = /\.mdx?$/`; the docs (`sync.mdx`) say sync "connects the editor to a folder of `.md` and `.mdx` files". Files are listed and saved.
- `parseMdx` (`mdast/parse.ts`) always uses `mdxjs()`; there is no CommonMark-only mode. `parseMdxToDoc` JSDoc: "Throws on MDX syntax errors". Four of the ordinary-Markdown inputs in the test above throw.
- Conclusion: `.md` is accepted by name only. A Vault of Obsidian Notes will have many notes that fail to open. I found no option to select a non-MDX grammar. I did not read the UI package for a fallback (such as opening failed files as raw source); this is not verified.

## Extension routes

1. **`syntax` dialects** (`createSyntax(components, options)`; `SyntaxOptions`: `headingSuffixes`, `math`, `directives`). Each dialect lives in `packages/core/src/syntax/*` with its own micromark extension + mdast-util pair (`directive`, `math`, `heading-suffixes`, `files`) wired explicitly in `parseMdx`. There is **no public hook to register a custom micromark/mdast extension**; `parseMdx` hard-codes the list. Turning one off "never breaks a document" (it falls back to verbatim). Route to Obsidian syntax: add dialects upstream or in a fork (wiki links, embeds, highlight, callout, comment, footnote, block id are each a micromark tokenizer + mdast node + PM node + serializer).
2. **Component specs** (`ComponentSpec`, `/components`): make JSX components editable (regions, props panel, slash menu). Can represent a Callout **only if the file contains JSX** (e.g. `<Callout type="tip">`), not `> [!tip]`. The `admonitionSpec` trick does map `:::note[Title]` directive syntax onto a spec while keeping `:::` in the file; the same pattern (syntax parsed into a JSX-attribute view, then the generic component conversion) could host `> [!tip]` if a callout dialect parsed it. Needs core changes either way.
3. **TipTap extensions** (`extensions` prop, `/extensions`): decorations, keyboard shortcuts, plugin state, commands, lifecycle hooks, `bubbleItems`. The docs say plainly that **custom nodes and marks are not allowed** since the MDX serializer cannot write them. Usable for cosmetic things only (e.g. decorating `==x==` or `[[x]]` as styled text, a decoration-only highlight with no schema change). This is a cheap partial WYSIWYG for highlight/wikilink display, but it does not alter edit-time escaping (the `\[\[` corruption comes from the serializer, not rendering).
4. **Upstream / fork**: MIT licensed, active (pushed 2026-11-01), single maintainer (fuma-nama), pre-v1. `@fumadocs-editor/core` is a separate package from `ui`, so a fork or PR can target `core` only. Candidate changes, smallest first:
   - (a) Make the serializer not escape `[[`, `![[`, `[!`, `^[`, and keep multi-line `%%` (fixes corruption while keeping text-level behavior).
   - (b) Make `parseMdx` accept extra micromark/mdast extension pairs and a `.md` CommonMark mode (no JSX/expressions).
   - (c) Full dialects with PM nodes and UI for each construct.
   Remark plugins are not usable as-is: the pipeline is micromark/mdast-util, not unified, and the PM schema must know every node.

## Test method and honest limits

- `npm i @fumadocs-editor/core@0.5.0` in a scratch dir; Node ESM script `rt.mjs` calls `parseMdxToDoc` then `serializeDocToMdx(doc, snapshot)` (untouched) and `serializeDocToMdx(doc, undefined)` (simulates every block edited). 29 inputs x 2 syntax configs. Raw output: `out.txt`.
- The second call simulates "edited" via the normalizing path; I did not drive the real React editor (`@fumadocs-editor/ui`) or edit in a browser, so I did not verify that an edit to block A leaves block B byte-identical in the real UI. The docs and the snapshot design (per-block `source`, unedited blocks emitted from source) say it does.
- I did not test `admonitionSpec` on `> [!tip]` separately beyond including it in config 2 (no change: it handles `:::` only).
- Highlight Color was not run as its own case.
- The `/components` page did not state `.md` vs `.mdx`; the `.md` conclusions come from source.
- `@fumadocs/editor` is not a package; the real names are `@fumadocs-editor/core|ui|studio`.
