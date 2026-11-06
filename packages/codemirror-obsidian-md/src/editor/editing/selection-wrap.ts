import { isolateHistory } from "@codemirror/commands";
import { EditorSelection, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** Typed characters that wrap a selection. Fixed, not configurable (ADR 0016). */
const WRAP_CHARS = new Set(["*", "_", "`", "~", "=", "[", "(", "{", '"', "'"]);

const CLOSERS: Record<string, string> = {
  "[": "]",
  "(": ")",
  "{": "}",
};

/**
 * Typing a wrap character over a selection wraps it instead of replacing it,
 * leaving the inner text selected. With nothing selected it does nothing, so
 * Auto-pair can own that case.
 */
export function selectionWrap(
  composing: (view: EditorView) => boolean,
): Extension {
  return EditorView.inputHandler.of((view, _from, _to, text) => {
    if (!WRAP_CHARS.has(text) || composing(view)) return false;
    const { state } = view;
    if (state.selection.main.empty) return false;
    const open = text;
    const close = CLOSERS[text] ?? text;
    view.dispatch(
      state.changeByRange((range) => {
        if (range.empty) {
          return {
            changes: { from: range.from, insert: text },
            range: EditorSelection.cursor(range.from + text.length),
          };
        }
        return {
          changes: [
            { from: range.from, insert: open },
            { from: range.to, insert: close },
          ],
          range: EditorSelection.range(
            range.anchor + open.length,
            range.head + open.length,
          ),
        };
      }),
      {
        userEvent: "input.type",
        scrollIntoView: true,
        annotations: isolateHistory.of("full"),
      },
    );
    return true;
  });
}
