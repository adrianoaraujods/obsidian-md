# next-obsidian

A Next.js and Fumadocs template that publishes an Obsidian Vault using `remark-obsidian-md`. Terms for Vault, Note, Wiki Link, Subpath and Block ID are defined by that package's glossary and mean the same here.

## Previewing

**Hover Preview**:
A popover that shows the content of the Note an internal link points to, without leaving the current Note. A link whose Subpath names a heading previews that section, and one whose Subpath is a Block ID previews that block.
_Avoid_: tooltip, popup, page preview, link card

**Preview Payload**:
The content of one Note prepared ahead of time for Hover Previews: its title, its Properties and its rendered body. One exists per Note, whatever Subpath a link carries.
_Avoid_: preview data, snapshot, excerpt

## Metadata

**Properties Panel**:
The collapsible block that lists a Note's Frontmatter properties. A Note shows it expanded by default; a Hover Preview shows it collapsed by default. Each remembers the reader's last choice separately.
_Avoid_: frontmatter table, metadata box, header
