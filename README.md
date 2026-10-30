# next-obsidian

A Next.js and Fumadocs template that publishes an Obsidian Vault with `remark-obsidian-md`. Terms such as Vault, Note, Wiki Link, Subpath and Block ID follow that package's glossary; see `GLOSSARY.md` for the template's own terms.

## Hover Previews

Hovering or focusing an internal link that points at a Note opens a **Hover Preview** of it, after a short delay. It stays open while the pointer is inside it and closes shortly after the pointer leaves or on Escape. Long Notes scroll inside the preview.

- A link to a heading (`[[Note#Heading]]`) previews that section, up to the next heading of the same or higher level. A link to a Block ID (`[[Note#^id]]`) previews that block; on a list item, that item.
- If the heading or block can't be found, the whole Note is shown.
- No preview appears for unresolved links, Assets, same-Note anchors, external links or routes that aren't Vault pages. On touch devices a tap navigates straight away.
- Links inside a preview are plain links; previews don't nest. Interactive client components in a Note body are inert in a preview.
- Each Note is prepared at build time as a static Preview Payload and downloaded only on the first hover, once per Note whatever Subpath the links carry. New Notes need no registration. See `docs/adr/0001-static-preview-payload.md` for the reasoning.

## Properties Panel

A Note's Frontmatter properties are listed in a collapsible **Properties Panel**.

- On a Note it starts expanded; in a Hover Preview it starts collapsed.
- Each remembers the reader's last choice separately, in the browser, and the choice follows across Notes, visits and open tabs.

## Tests

`pnpm test` runs the unit tests (Vitest) and the browser tests (Playwright) against a small fixture Vault. See `tests/README.md`.
