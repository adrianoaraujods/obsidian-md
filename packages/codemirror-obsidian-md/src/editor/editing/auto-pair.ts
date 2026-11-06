import {
  EditorSelection,
  type EditorState,
  type Extension,
  findClusterBreak,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/** Openers that insert their closer too. Fixed, not configurable (ADR 0016). */
const PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "`": "`",
};

const CLOSERS = new Set([")", "]", "}"]);

/**
 * Typing an opener with nothing selected inserts its closer too, with the
 * cursor between. A selection is left to Selection Wrap. Backspace between an
 * opener and its closer deletes both.
 */
export function autoPair(
  composing: (view: EditorView) => boolean,
  options: { wikiLinkAutoClose?: boolean } = {},
): Extension {
  const wikiLinkAutoClose = options.wikiLinkAutoClose !== false;
  const backspace = keymap.of([
    {
      key: "Backspace",
      run: (view) => !composing(view) && deleteEmptyPair(view),
    },
  ]);
  return [
    backspace,
    EditorView.inputHandler.of((view, _from, _to, text) => {
      const close = PAIRS[text];
      const isQuote = text === '"' || text === "'";
      const isCloser = CLOSERS.has(text);
      if ((close === undefined && !isCloser) || composing(view)) return false;
      const { state } = view;
      if (!state.selection.main.empty) return false;
      view.dispatch(
        state.changeByRange((range) => {
          if (
            range.empty &&
            state.sliceDoc(range.from, range.from + 1) === text
          )
            return { range: EditorSelection.cursor(range.from + 1) };
          const wikiOpen =
            !wikiLinkAutoClose &&
            text === "[" &&
            state.sliceDoc(range.from - 1, range.from) === "[";
          if (
            close === undefined ||
            wikiOpen ||
            (isQuote && afterWord(state, range.from))
          ) {
            return {
              changes: { from: range.from, insert: text },
              range: EditorSelection.cursor(range.from + text.length),
            };
          }
          return {
            changes: { from: range.from, insert: text + close },
            range: EditorSelection.cursor(range.from + text.length),
          };
        }),
        { userEvent: "input.type", scrollIntoView: true },
      );
      return true;
    }),
  ];
}

const WORD = /[\p{L}\p{N}_]/u;

/** Whether the character before `pos` is a word character. */
function afterWord(state: EditorState, pos: number) {
  return pos > 0 && WORD.test(state.sliceDoc(pos - 1, pos));
}

/** Whether the cursor sits between an opener and its closer. */
function inEmptyPair(view: EditorView, pos: number) {
  if (pos === 0) return false;
  const before = view.state.sliceDoc(pos - 1, pos);
  return (
    PAIRS[before] !== undefined &&
    PAIRS[before] === view.state.sliceDoc(pos, pos + 1)
  );
}

function deleteEmptyPair(view: EditorView): boolean {
  const { state } = view;
  if (!state.selection.ranges.some((r) => r.empty && inEmptyPair(view, r.from)))
    return false;
  view.dispatch(
    state.changeByRange((range) => {
      if (range.empty && inEmptyPair(view, range.from)) {
        return {
          changes: { from: range.from - 1, to: range.from + 1 },
          range: EditorSelection.cursor(range.from - 1),
        };
      }
      const line = state.doc.lineAt(range.from);
      const from = !range.empty
        ? range.from
        : range.from === line.from
          ? Math.max(0, range.from - 1)
          : line.from +
            findClusterBreak(line.text, range.from - line.from, false);
      return {
        changes: { from, to: range.to },
        range: EditorSelection.cursor(from),
      };
    }),
    { userEvent: "delete.backward", scrollIntoView: true },
  );
  return true;
}
