import { EditorSelection, type EditorState, Prec } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";

import { isCrlf } from "../state.js";
import { inFencedCode } from "./code-fence.js";
import { indentListItem, unindentListItem } from "./list-indent.js";
import { continuationPrefix, parseListLine } from "./list-line.js";

/** Where the line at `pos` ends, before any `\r` of a CRLF line break. */
function contentEnd(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  return Math.min(pos, line.from + line.text.replace(/\r$/, "").length);
}

/** Enter continues the list item, quote or Callout line the cursor is on. */
const continueList: Command = (view) => {
  if (view.composing || view.compositionStarted) return false;
  const { state } = view;
  const crlf = isCrlf(state.doc.toString());
  const lineBreak = crlf ? "\r\n" : "\n";
  const ranges = state.selection.ranges.map((range) => {
    const line = state.doc.lineAt(range.from);
    if (inFencedCode(state.doc, line.number)) return null;
    const item = parseListLine(line.text);
    return item && range.from - line.from >= item.contentStart ? item : null;
  });
  if (!ranges.some(Boolean)) return false;
  let i = 0;
  view.dispatch(
    state.update(
      state.changeByRange((range) => {
        const item = ranges[i++];
        if (item && !item.content.trim() && range.empty) {
          const line = state.doc.lineAt(range.from);
          const end = line.from + line.text.replace(/\r$/, "").length;
          return {
            changes: { from: line.from, to: end, insert: "" },
            range: EditorSelection.cursor(line.from),
          };
        }
        const prefix = item ? continuationPrefix(item) : "";
        const insert = lineBreak + prefix;
        // A cursor past a CRLF line's `\r` goes before it.
        const at =
          item && range.empty ? contentEnd(state, range.from) : range.from;
        return {
          changes: {
            from: at,
            to: range.empty ? at : range.to,
            insert,
          },
          range: EditorSelection.cursor(at + insert.length),
        };
      }),
      { scrollIntoView: true, userEvent: "input" },
    ),
  );
  return true;
};

/** Backspace after an empty marker removes the marker. */
const removeEmptyMarker: Command = (view) => {
  if (view.composing || view.compositionStarted) return false;
  const { state } = view;
  const emptyLines = state.selection.ranges.map((range) => {
    if (!range.empty) return null;
    const line = state.doc.lineAt(range.from);
    if (inFencedCode(state.doc, line.number)) return null;
    const item = parseListLine(line.text);
    const end = line.from + line.text.replace(/\r$/, "").length;
    return item && !item.content.trim() && range.from >= end ? line : null;
  });
  if (emptyLines.some((line) => !line)) return false;
  let i = 0;
  view.dispatch(
    state.update(
      state.changeByRange((range) => {
        const line = emptyLines[i++]!;
        const end = line.from + line.text.replace(/\r$/, "").length;
        return {
          changes: { from: line.from, to: end, insert: "" },
          range: EditorSelection.cursor(line.from),
        };
      }),
      { scrollIntoView: true, userEvent: "delete.backward" },
    ),
  );
  return true;
};

/** List continuation (Enter, Backspace), above the stock and CRLF Enter. */
export function listContinuation() {
  return Prec.highest(
    keymap.of([
      { key: "Enter", run: continueList },
      { key: "Backspace", run: removeEmptyMarker },
      { key: "Tab", run: indentListItem },
      { key: "Shift-Tab", run: unindentListItem },
    ]),
  );
}
