# next-obsidian

A Next.js and Fumadocs template that publishes an Obsidian Vault with `remark-obsidian-md`. Terms such as Vault, Note, Wiki Link, Subpath and Block ID follow that package's glossary; see `GLOSSARY.md` for the template's own terms.

## Vaults

This example has two Vaults, and they are not interchangeable.

- **Sample Vault** (`public/vault`) is the demo. A short set of Notes that reads as documentation of what the plugin supports: Wiki Links with Aliases and Subpaths, Embeds, Callouts, Highlights, Comments, Block IDs, Properties and Hover Previews (including nested ones). `pnpm dev` and `pnpm build` publish it. Start at its `index.md`.
- **Fixture Vault** (`tests/fixtures/vault`) is test data. It holds edge cases for the tests and is never published by the demo. Don't edit it to improve the demo.

Set `VAULT_DIR` to publish a different Vault.

## Hover Previews

Hovering or focusing an internal link that points at a Note opens a **Hover Preview** of it, after a short delay. It stays open while the pointer is inside it and closes shortly after the pointer leaves or on Escape. Long Notes scroll inside the preview.

- A link to a heading (`[[Note#Heading]]`) previews that section, up to the next heading of the same or higher level. A link to a Block ID (`[[Note#^id]]`) previews that block; on a list item, that item.
- If the heading or block can't be found, the whole Note is shown.
- No preview appears for unresolved links, Assets, same-Note anchors, external links or routes that aren't Vault pages. On touch devices a tap navigates straight away.
- Links inside a preview that point at another Note open their own preview, to any depth, with the same delays, Subpath rules and Properties state; moving into a nested preview keeps its parent open, and Escape closes the innermost first. A link back to the previewed Note gets none. Interactive client components in a Note body are inert in a preview.
- Each Note is prepared at build time as a static Preview Payload and downloaded only on the first hover, once per Note whatever Subpath the links carry. New Notes need no registration. See `docs/adr/0001-static-preview-payload.md` for the reasoning.

## Properties Panel

A Note's Frontmatter properties are listed in a collapsible **Properties Panel**.

- On a Note it starts expanded; in a Hover Preview it starts collapsed.
- Each remembers the reader's last choice separately, in the browser, and the choice follows across Notes, visits and open tabs.

## Tests

`pnpm test` runs the unit tests (Vitest) and the browser tests (Playwright) against the fixture Vault (the sample Vault has a unit test that checks it covers every feature and that its links resolve). See `tests/README.md`.
