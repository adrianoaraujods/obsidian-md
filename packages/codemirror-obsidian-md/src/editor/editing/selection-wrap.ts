import { EditorSelection, type SelectionRange } from "@codemirror/state";

import { BRACKET_CLOSERS } from "./pairs.js";

/** Typed characters that wrap a selection. Fixed, not configurable (ADR 0016). */
export const WRAP_CHARS = new Set([
  "*",
  "_",
  "`",
  "~",
  "=",
  "[",
  "(",
  "{",
  '"',
  "'",
]);

/**
 * Typing a wrap character over a non-empty `range` wraps it instead of
 * replacing it, leaving the inner text selected.
 */
export function wrapRange(range: SelectionRange, text: string) {
  const close = BRACKET_CLOSERS[text] ?? text;
  return {
    changes: [
      { from: range.from, insert: text },
      { from: range.to, insert: close },
    ],
    range: EditorSelection.range(
      range.anchor + text.length,
      range.head + text.length,
    ),
  };
}
