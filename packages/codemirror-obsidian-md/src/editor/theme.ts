import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const HEADING_SIZES = ["2em", "1.6em", "1.37em", "1.25em", "1.12em", "1em"];

const headings = Object.fromEntries(
  HEADING_SIZES.map((size, i) => [
    `.cm-obsidian-h${i + 1}`,
    { fontSize: size },
  ]),
);

/**
 * Base styling for the editor itself: a readable proportional font, visible
 * cursor, headings and emphasis that look rendered, a Callout drawn as one
 * box, and a themed `[[` picker. It uses CSS variables with fallbacks, so it
 * follows the host's light and dark themes.
 */
export const livePreviewTheme: Extension = EditorView.theme({
  "&": { color: "inherit", backgroundColor: "transparent" },
  ".cm-scroller": {
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  ".cm-content": {
    fontFamily: "inherit",
    lineHeight: "1.6",
    caretColor: "currentColor",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "currentColor",
  },
  // CodeMirror places these empty images beside widgets; page CSS (images as
  // blocks, size resets) inflates the line around them, so take them out.
  ".cm-widgetBuffer": { display: "none" },
  ".cm-obsidian-heading": { fontWeight: "700", lineHeight: "1.3" },
  ...headings,
  ".cm-obsidian-strong": { fontWeight: "700" },
  ".cm-obsidian-em": { fontStyle: "italic" },
  ".cm-obsidian-code": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "0.9em",
    backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)",
    borderRadius: "4px",
    padding: "0 4px",
  },
  ".cm-obsidian-quote": {
    borderLeft: "3px solid color-mix(in srgb, currentColor 30%, transparent)",
    paddingLeft: "12px",
  },
  ".cm-callout": { margin: "0" },
  ".cm-tooltip": {
    color: "var(--popover-foreground, inherit)",
    backgroundColor: "var(--popover, Canvas)",
    border:
      "1px solid var(--border, color-mix(in srgb, currentColor 20%, transparent))",
    borderRadius: "6px",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete": {
    color: "var(--popover-foreground, inherit)",
    backgroundColor: "var(--popover, Canvas)",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily: "inherit",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    color: "var(--accent-foreground, inherit)",
    backgroundColor:
      "var(--accent, color-mix(in srgb, currentColor 12%, transparent))",
  },
  ".cm-completionDetail": { opacity: "0.6" },
});
