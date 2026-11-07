import { EditorSelection, type EditorState, Prec } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";

import { isCrlf } from "../state.js";
import { plainBackspace } from "./backspace.js";
import { inFencedCode } from "./code-fence.js";
import { isComposing } from "./composition.js";
import { contentEnd } from "./line-text.js";
import { indentListItem, unindentListItem } from "./list-indent.js";
import { continuationPrefix, parseListLine } from "./list-line.js";

/** The whitespace a line starts with, up to `pos`. */
function leadingIndent(state: EditorState, pos: number): string {
  const line = state.doc.lineAt(pos);
  return /^[ \t]*/.exec(line.text.slice(0, pos - line.from))?.[0] ?? "";
}

/** Enter continues the list item, quote or Callout line the cursor is on. */
const continueList: Command = (view) => {
  if (isComposing(view)) return false;
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
          const end = contentEnd(state, line.to);
          return {
            changes: { from: line.from, to: end, insert: "" },
            range: EditorSelection.cursor(line.from),
          };
        }
        // Off a list line the new line keeps the indentation, as the stock
        // Enter does.
        const prefix = item
          ? continuationPrefix(item)
          : leadingIndent(state, range.from);
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

/**
 * Backspace after an empty marker removes the marker. With several cursors
 * each range decides for itself; the others delete a character as usual.
 */
const removeEmptyMarker: Command = (view) => {
  if (isComposing(view)) return false;
  const { state } = view;
  const emptyLines = state.selection.ranges.map((range) => {
    if (!range.empty) return null;
    const line = state.doc.lineAt(range.from);
    if (inFencedCode(state.doc, line.number)) return null;
    const item = parseListLine(line.text);
    return item &&
      !item.content.trim() &&
      range.from >= contentEnd(state, line.to)
      ? line
      : null;
  });
  if (!emptyLines.some(Boolean)) return false;
  let i = 0;
  view.dispatch(
    state.update(
      state.changeByRange((range) => {
        const line = emptyLines[i++];
        if (!line) return plainBackspace(state, range);
        return {
          changes: {
            from: line.from,
            to: contentEnd(state, line.to),
            insert: "",
          },
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
