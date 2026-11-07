import { EditorSelection } from "@codemirror/state";
import type { Command } from "@codemirror/view";

/** `Mod-k`: wraps each selection as `[text]()` with the cursor in the
 * parentheses; with nothing selected it inserts `[]()` with the cursor inside
 * the brackets. */
export const insertLink: Command = (view) => {
  const { state } = view;
  view.dispatch(
    state.update(
      state.changeByRange((range) => ({
        changes: [
          { from: range.from, insert: "[" },
          { from: range.to, insert: "]()" },
        ],
        range: EditorSelection.cursor(
          range.empty ? range.to + 1 : range.to + 3,
        ),
      })),
      { userEvent: "input", scrollIntoView: true },
    ),
  );
  return true;
};
