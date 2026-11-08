# obsidian-md

A monorepo that ports Obsidian.md's markdown syntax into standard MDAST (`remark-obsidian-md`), plus headless React components (`react-obsidian-md`) and Fumadocs glue (`fumadocs-obsidian-md`), so Obsidian Vaults can be published as Wikis by any unified pipeline.

## Vault & notes

**Vault**:
The root directory of Notes and Assets that Wiki Links and Embeds are resolved against.
_Avoid_: content directory, docs folder, public folder

**Note**:
A single markdown file within a Vault.
_Avoid_: page, document, file

**Asset**:
A non-markdown file in a Vault (image, PDF, audio) that can be embedded but not linked as a Note.
_Avoid_: media, attachment, resource

## Publishing

**Slug**:
The path a Note is published under, built from its path segments (e.g. `Geografia/Localizações/Sebá.md` → `geografia/localizacoes/seba`). Every Note of a Vault gets its own.
_Avoid_: route, page path, permalink

**Wiki**:
A website that publishes a Vault, one page per Note.
_Avoid_: site, docs site, digital garden

**Example**:
A runnable app in `examples/` that shows a Wiki built from the packages and is meant to be copied to start a new one.
_Avoid_: starter, boilerplate, demo app

## Links & embeds

**Wiki Link**:
Obsidian's `[[…]]` construct for referring to a Note or Asset.
_Avoid_: wikilink, internal link, backlink

**Link Target**:
The part of a Wiki Link or Embed that names the Note or Asset, before any Subpath.
_Avoid_: path, href, destination

**Subpath**:
The `#Heading` or `#^block-id` suffix of a Link Target that selects a part of the target instead of the whole.
_Avoid_: anchor, fragment, hash

**Alias**:
Display text that overrides the target's name, written after a `|` in a Wiki Link.
_Avoid_: label, text, title

**Embed**:
The `![[…]]` construct that renders the target's content in place instead of linking to it.
_Avoid_: transclusion, include

## Previewing

**Hover Preview**:
A popover that shows the content of the Note an internal link points to, without leaving the current Note. A link whose Subpath names a heading previews that section, and one whose Subpath is a Block ID previews that block. It opens only once its content has arrived, and a link inside one opens a further Hover Preview, to any depth.
_Avoid_: tooltip, popup, page preview, link card

**Preview Payload**:
The content of one Note prepared ahead of time for Hover Previews: its title, its Properties and its rendered body. One exists per Note, whatever Subpath a link carries.
_Avoid_: preview data, snapshot, excerpt

## Inline syntax

**Highlight**:
Text wrapped in `==…==`, whose content is parsed as inline Markdown.
_Avoid_: mark, marker, selection

**Highlight Color**:
Color a Highlight carries, set by a color emoji at the start of the Highlight's content.
_Avoid_: color, colour, swatch, style

**Comment**:
Text wrapped in `%%…%%` and omitted from rendered output.
_Avoid_: annotation, note

**Footnote**:
A short note written inline at the point it annotates, using `^[text]`, whose content is parsed as inline Markdown.
_Avoid_: endnote, reference

## Blocks

**Block ID**:
A `^id` marker at the end of a block that names it for later reference.
_Avoid_: block anchor, block name

**Block Reference**:
A Wiki Link or Embed whose Subpath is a Block ID (e.g. `[[Note#^id]]`).
_Avoid_: block link

**Callout**:
A blockquote whose first line begins `> [!type]`, rendered as a styled, optionally foldable block.
_Avoid_: admonition, alert, aside

**Callout Type**:
The `type` of a Callout, which selects its color and icon. Obsidian's built-in types are styled by the Stylesheet.
_Avoid_: kind, variant, category

## Metadata

**Frontmatter**:
The YAML metadata block at the top of a Note, surfaced in Obsidian as Properties. It is hidden by default when the Note is embedded. `getFrontmatter` resolves its values into plain scalars, links (`FrontmatterLink`, unresolved when the Wiki Link names no Note) and dates (`FrontmatterDate`, of kind `date` or `datetime`), exported as `FrontmatterValue`; the type a property has in Obsidian is a `PropertyType`.
_Avoid_: metadata, YAML header

**Properties Panel**:
The collapsible block that lists a Note's Frontmatter properties. A Note shows it expanded by default; a Hover Preview shows it collapsed by default. Each remembers the reader's last choice separately.
_Avoid_: frontmatter table, metadata box, header

**CSS Class**:
A class name listed in a Note's `cssclasses` Frontmatter property, applied to that Note's rendered container and carried along when the Note is embedded.
_Avoid_: style, theme class

## Editing

**Live Preview**:
The editing mode where a Note shows its constructs rendered, and reveals a construct's raw syntax only while the cursor is inside it. The Note's text is what is edited and saved, so saving never changes syntax the reader did not touch.
_Avoid_: WYSIWYG, rich-text mode, split preview

**Editing Shortcut**:
A key binding that formats or restructures the Note's text in the editor, matching the one Obsidian ships by default (bold, italic, insert link, indent, unindent, toggle task). A consumer may rebind or disable each one.
_Avoid_: hotkey, keybinding, command

**Selection Wrap**:
Typing a marker or opening-bracket character while text is selected wraps the selection in it instead of replacing it, and typing it again wraps once more (`*` then `*` makes bold).
_Avoid_: surround, auto-format

**Auto-pair**:
Typing an opening bracket or quote with nothing selected inserts its closer too and leaves the cursor between them; typing the closer steps over it, and Backspace on an empty pair removes both. A quote typed after a word character does not pair, so apostrophes in prose are left alone.
_Avoid_: auto-close, bracket matching

## Organizing

**File Tree**:
The Wiki's sidebar listing of a Vault's Notes and folders, in the order the Vault's `meta.json` files give. It always shows the deployed Vault, so a change is visible there only after the Wiki is redeployed.
_Avoid_: sidebar, navigation, page tree

**Separator**:
A titled label in a folder's order that groups the items listed after it, up to the next Separator. It moves no file and changes no Slug.
_Avoid_: group, section, divider, heading

**Reorganize**:
To move or rename Notes, Assets and folders, reorder them, and add or remove Separators, as one staged set of changes that is applied as a single commit. Links that would break are rewritten in the same commit.
_Avoid_: restructure, rearrange, refactor

**Manager**:
The page where a signed-in user reorganizes a Vault by dragging items in a tree. It works on the deployed Vault and is locked while a redeploy is pending.
_Avoid_: file manager, explorer, organizer

## Styling

**Stylesheet**:
The CSS shipped with the plugin that gives rendered Callouts, Highlights and unresolved links the look they have in Obsidian. Consumers opt in by importing it.
_Avoid_: theme, default styles, skin

**Rendered Container**:
The element that holds a Note's rendered content, and the only place the Stylesheet applies.
_Avoid_: wrapper, root, article
