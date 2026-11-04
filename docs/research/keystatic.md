# Keystatic as the Wiki editor (issue #63, map #60)

Researched 2026-11-04 against keystatic.com/docs and a shallow clone of github.com/Thinkmill/keystatic at `b8ec965` (2026-10-02). `@keystatic/core` 0.6.9, `@keystatic/next` 5.0.5. Terms follow `GLOSSARY.md` (Vault, Note, Asset, Wiki).

## Verdict

Keystatic's GitHub mode is cheap to run (no database) and its Next.js integration is a four-file setup. But its markdown/MDX editor is a closed ProseMirror schema with no hook for custom syntax. A Note edited through it would have Wiki Links, Embeds and Callouts backslash-escaped on save, so it cannot safely edit a Vault of Obsidian Notes as-is. Using it only for non-Note content (settings, landing pages) is viable; using it as the Note editor is not, short of forking.

## 1. GitHub storage mode and auth

- Set `storage: { kind: 'github', repo: { owner, name } }` (or `repo: 'owner/name'`). The repo must already exist. Optional `branchPrefix` limits which branches the UI lists/creates. Source: https://keystatic.com/docs/github-mode
- First visit to `/keystatic` runs a flow that creates a custom GitHub App owned by you (manifest conversion against `api.github.com/app-manifests/{code}/conversions`, `packages/keystatic/src/api/api-node.ts`) and writes `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET` and `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` to `.env`. Those must be copied to the host. Source: github-mode docs; `api/generic.ts` lines 36-61, 107-113.
- Authorization is GitHub's: anyone with write access to the repo can sign in; there is no separate user store. Source: github-mode docs.
- No database. After OAuth, the access token is set as a cookie (`keystatic-gh-access-token`) and the refresh token as an httpOnly cookie encrypted with `KEYSTATIC_SECRET` (`api/generic.ts` ~255-290). The admin SPA then talks to `https://api.github.com/graphql` directly (`app/provider.tsx` line 42) and commits to the repo. Content lives only in git.
- The Keystatic API route is server code, so the host must run Node (docs: deployment section, marked "coming soon"). The admin cannot be a pure static export; the published Wiki can still be static.
- Open issue: no way to set `redirect_uri` explicitly (Thinkmill/keystatic#1022), which complicates preview deployments.
- Keystatic Cloud (`cloud: { project }`) is an alternative that proxies GitHub; not needed.

## 2. Next.js integration

- Docs target Next 14 App Router; `@keystatic/next` 5.0.5 peers `next >=14`, React 18.2 or 19. Source: https://keystatic.com/docs/installation-next-js; `packages/next/package.json`. Not tested against our Next version; check the Fumadocs example's Next version before a spike.
- Files: `keystatic.config.ts`, `app/keystatic/keystatic.ts` (client, `makePage(config)`), `app/keystatic/layout.tsx`, `app/keystatic/[[...params]]/page.tsx`, `app/api/keystatic/[...params]/route.ts` (`makeRouteHandler({ config })`, exports GET/POST).
- The Reader API (`createReader(process.cwd(), config)` or `createGitHubReader`) reads entries server-side. We would not need it for Notes, since Fumadocs reads the files.

## 3. Markdown/MDX field extensibility

- `fields.markdoc` and `fields.mdx` accept `components` (content components: wrapper, block, inline, mark, repeating), `extension`, `options` (which formatting the editor allows), `directory`/`publicPath` for images, and `.inline()` variants. Sources: https://keystatic.com/docs/fields/mdx, /fields/markdoc, /content-components.
- No documented option for remark/micromark plugins or custom syntax. Components serialize only as MDX JSX / Markdoc tags.
- Source confirms it: the markdown path parses with plain `mdast-util-from-markdown` (`form/fields/markdoc/ui.tsx` line 83) and converts mdast to a fixed ProseMirror schema (`editor/mdx/parse.ts`). Unknown mdast node types hit `error("Unhandled type ...")` and `notAllowed()` (parse.ts ~75, ~450). Serialization goes back through `mdast-util-to-markdown` with GFM autolink/strikethrough/table and `mdxToMarkdown` only.
- Docs constraints for MDX: no `import` statements, no raw HTML tags. Open issues show gaps even for standard syntax: footnotes (#990), LaTeX (#1319).
- Experiment (mine): stock `mdast-util-from-markdown` then `mdast-util-to-markdown`, the same pair Keystatic uses (Keystatic's own text-node path not run end to end). `Text [[Note#^id|Alias]] ![[img.png]] ==hi== %%c%% ^blk` plus `> [!note] Title` comes back as `\[\[Note#^id|Alias]]`, `!\[\[img.png]]`, `\[!note]`. Wiki Links, Embeds and Callouts are corrupted into escaped literal text; `==`, `%%`, `^id` survive only because they are plain text. A spike should confirm in the real editor.
- Workaround within the model: express each Obsidian construct as a content component. That puts JSX in a Note, which defeats an Obsidian-native Vault.

## 4. Mapping a Vault onto collections

- Collection `path` needs `*` or `**`. `content/notes/**` makes slugs contain `/`, so nested folders work by carrying the folder in the slug (e.g. `Geografia/Localizações/Sebá`). Source: https://keystatic.com/docs/path-wildcard; `app/path-utils.ts` lines 10-20.
- A trailing slash (`*/`) makes each entry a directory with `index.*`; no trailing slash puts files directly in the folder. Notes need the flat-file form with `format: { contentField: 'body' }` and `extension: 'md'`. Source: https://keystatic.com/docs/content-organisation, /format-options.
- Keystatic's slug is the file path; our **Slug** is derived separately by `slugifyPath`, so no conflict, but Keystatic's slug-field validation may fight with names like `Sebá.md` (not tested).
- Frontmatter is schema-driven: every property must be declared as a field, so dates, wiki-link properties and `cssclasses` need matching field types. Treatment of undeclared keys is not documented and I did not verify it in source; expect them to be dropped or rejected on save, losing Obsidian Properties.
- Assets: images are stored per field via `directory`, independent of entry path. Obsidian resolves `![[img.png]]` by name from anywhere in the Vault; Keystatic's image insertion writes standard `![](path)` into the body, and Vault Assets outside those directories are not browsable. Source: content-organisation docs.
- One catch-all `**` collection works mechanically; the docs describe no folder-tree UI.

## 5. Cost of combining with Fumadocs and our plugin

- Read side is unaffected: Fumadocs (`examples/fumadocs/source.config.ts`) reads the Vault dir through `remark-obsidian-md`. Keystatic never renders ("you are responsible for rendering", fields docs). No code collision.
- The pain is the write side. Keystatic would commit to the same Notes, so its serializer must round-trip our syntax, and it cannot (section 3). Options:
  1. Fork/patch `@keystatic/core` to add micromark/mdast extensions and ProseMirror nodes for each construct in `remark-obsidian-md` (Wiki Link, Embed, Highlight, Comment, Footnote, Callout, Block ID). Large, and tied to 0.x editor internals.
  2. Frontmatter-only editing with an opaque body. Not supported out of the box; the body field is the editor.
  3. Use Keystatic for non-Note content only (home page, config).
- Hosting: a Node runtime and a GitHub App for the editor; the Wiki itself can stay static. Editor commits trigger a rebuild like any push.
- Maintenance: latest commit 2026-10-02, but packages are 0.x. ADR 0004 prefers delegating to maintained peers; here there is no extension point to delegate to.

## Open questions for a spike

1. Does the real editor escape `[[`, `![[` and `> [!note]` as the stock serializer does?
2. Treatment of undeclared frontmatter keys on save.
3. Behaviour of the admin with a large (1000+ Note) `**` collection.
4. Compatibility with the Next version used by `examples/fumadocs`.

## Sources

- https://keystatic.com/docs/github-mode, /installation-next-js, /fields/markdoc, /fields/mdx, /content-components, /collections, /content-organisation, /path-wildcard, /format-options
- https://github.com/Thinkmill/keystatic at b8ec965: `packages/keystatic/src/api/generic.ts`, `api/api-node.ts`, `app/provider.tsx`, `app/path-utils.ts`, `form/fields/markdoc/ui.tsx`, `form/fields/markdoc/editor/mdx/parse.ts`, `serialize.ts`; `packages/next/package.json`
- Issues: Thinkmill/keystatic#1022, #990, #1319
