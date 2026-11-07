import {
  EditorSelection,
  type EditorState,
  findClusterBreak,
  type SelectionRange,
} from "@codemirror/state";

/**
 * What a plain Backspace does at `range`: deletes the selection, or the
 * character before the cursor. For commands that handle only some of several
 * ranges and leave the rest to behave as usual.
 */
export function plainBackspace(state: EditorState, range: SelectionRange) {
  const line = state.doc.lineAt(range.from);
  const from = !range.empty
    ? range.from
    : range.from === line.from
      ? Math.max(0, range.from - 1)
      : line.from + findClusterBreak(line.text, range.from - line.from, false);
  return {
    changes: { from, to: range.to },
    range: EditorSelection.cursor(from),
  };
}
