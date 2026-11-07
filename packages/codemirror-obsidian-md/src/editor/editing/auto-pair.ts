import {
  EditorSelection,
  type EditorState,
  type SelectionRange,
} from "@codemirror/state";
import { type EditorView, keymap } from "@codemirror/view";

import { plainBackspace } from "./backspace.js";
import { isComposing } from "./composition.js";
import { BRACKET_CLOSERS } from "./pairs.js";

/** Openers that insert their closer too: brackets, quotes and the backtick. */
const PAIRS: Readonly<Record<string, string>> = {
  ...BRACKET_CLOSERS,
  '"': '"',
  "'": "'",
  "`": "`",
};

const CLOSERS = new Set(Object.values(BRACKET_CLOSERS));

const WORD = /[\p{L}\p{N}_]/u;

/** Whether the character before `pos` is a word character. */
function afterWord(state: EditorState, pos: number) {
  return pos > 0 && WORD.test(state.sliceDoc(pos - 1, pos));
}

/** Whether the character typed here can be handled by `pairRange` at all. */
export function isPairKey(text: string): boolean {
  return PAIRS[text] !== undefined || CLOSERS.has(text);
}

/**
 * What typing `text` does at an empty `range`: inserts its closer too, or
 * steps over an identical closer already there. `null` leaves the key to the
 * default input.
 *
 * With `pairing` off only the `[[` -> `[[]]` close is left (and stepping over
 * its `]]`), so a consumer can drop general pairing and keep that one.
 */
export function pairRange(
  state: EditorState,
  range: SelectionRange,
  text: string,
  pairing: boolean,
) {
  const next = state.sliceDoc(range.from, range.from + 1);
  const close = PAIRS[text];
  if (!pairing) {
    const line = state.doc.lineAt(range.from);
    if (
      text === "]" &&
      next === "]" &&
      line.text.slice(0, range.from - line.from).includes("[[")
    )
      return { range: EditorSelection.cursor(range.from + 1) };
    if (text === "[" && state.sliceDoc(range.from - 1, range.from) === "[") {
      return {
        changes: { from: range.from, insert: "[]]" },
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    return null;
  }
  if (close === undefined && !CLOSERS.has(text)) return null;
  if (next === text) return { range: EditorSelection.cursor(range.from + 1) };
  if (close === undefined || (isQuote(text) && afterWord(state, range.from))) {
    return {
      changes: { from: range.from, insert: text },
      range: EditorSelection.cursor(range.from + text.length),
    };
  }
  return {
    changes: { from: range.from, insert: text + close },
    range: EditorSelection.cursor(range.from + text.length),
  };
}

function isQuote(text: string) {
  return text === '"' || text === "'";
}

/** Whether the cursor sits between an opener and its closer. */
function inEmptyPair(state: EditorState, pos: number) {
  if (pos === 0) return false;
  const before = state.sliceDoc(pos - 1, pos);
  return (
    PAIRS[before] !== undefined &&
    PAIRS[before] === state.sliceDoc(pos, pos + 1)
  );
}

function deleteEmptyPair(view: EditorView): boolean {
  const { state } = view;
  if (
    !state.selection.ranges.some((r) => r.empty && inEmptyPair(state, r.from))
  )
    return false;
  view.dispatch(
    state.changeByRange((range) =>
      range.empty && inEmptyPair(state, range.from)
        ? {
            changes: { from: range.from - 1, to: range.from + 1 },
            range: EditorSelection.cursor(range.from - 1),
          }
        : plainBackspace(state, range),
    ),
    { userEvent: "delete.backward", scrollIntoView: true },
  );
  return true;
}

/** Backspace between an opener and its closer deletes both. */
export const autoPairBackspace = keymap.of([
  {
    key: "Backspace",
    run: (view) => !isComposing(view) && deleteEmptyPair(view),
  },
]);
