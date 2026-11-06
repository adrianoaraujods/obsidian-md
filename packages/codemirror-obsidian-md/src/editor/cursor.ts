import type { EditorState } from "@codemirror/state";

/**
 * The cursor-reveal helper: true when any selection range touches
 * `[from, to]` (ends included), so a construct under the cursor shows its raw
 * syntax. Providers call this to decide between the rendered and raw form.
 */
export function isRevealed(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}
