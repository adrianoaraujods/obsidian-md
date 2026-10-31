# react-obsidian-md

Headless React components for Obsidian.md content: a collapsible **Properties Panel** with persisted state, a **Hover Preview** popover, and the client helpers that fetch a **Preview Payload**. It ships no CSS; style it with your own.

Terms follow the [glossary](../../GLOSSARY.md). Pair it with [`remark-obsidian-md`](../remark-obsidian-md), and with [`fumadocs-obsidian-md`](../fumadocs-obsidian-md) for the Fumadocs side of previews.

## Installation

```sh
pnpm add react-obsidian-md
```

`react`, `react-dom` and `remark-obsidian-md` are peer dependencies.

## What it exports

- `ObsidianProvider` / `useObsidian`: context that configures the components.
- `PropertiesPanel`, `Properties`, `FormattedDate`: render a Note's Frontmatter properties; the panel remembers whether the reader left it open (`PAGE_PROPERTIES_KEY`, `PREVIEW_PROPERTIES_KEY`).
- `HoverPreview`, `PreviewBody`: open a preview of the Note an internal link points to, nested to any depth.
- `fetchPreviewPayload`, `slicePreviewHtml`, `previewPayloadUrl`, `PREVIEW_PATH` and the `PreviewPayload` type: the client side of the static Preview Payload described in [ADR 0009](../../docs/adr/0009-static-preview-payload.md).
- `Collapsible`, `CollapsiblePanel`, `CollapsibleTrigger`, `usePersistedOpen`: the building blocks.

See [`examples/fumadocs`](../../examples/fumadocs) for a complete usage, including styling.

## License

MIT
