import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { isComposing } from "./composition.js";

const URL_PATTERN = /^https?:\/\/\S+$/i;

/**
 * Pasting a single http(s) URL over selected text makes `[text](url)`. Empty
 * ranges (several cursors) get the URL as plain text; with no selected range
 * at all the paste is left to the browser.
 */
export const pasteUrlAsLink = EditorView.domEventHandlers({
  paste(event, view) {
    if (isComposing(view)) return false;
    const url = event.clipboardData?.getData("text/plain").trim() ?? "";
    if (!URL_PATTERN.test(url)) return false;
    const { state } = view;
    if (state.selection.ranges.every((range) => range.empty)) return false;
    event.preventDefault();
    view.dispatch(
      state.update(
        state.changeByRange((range) => {
          if (range.empty) {
            return {
              changes: { from: range.from, insert: url },
              range: EditorSelection.cursor(range.from + url.length),
            };
          }
          const insert = `[${state.sliceDoc(range.from, range.to)}](${url})`;
          return {
            changes: { from: range.from, to: range.to, insert },
            range: EditorSelection.cursor(range.from + insert.length),
          };
        }),
        { userEvent: "input.paste", scrollIntoView: true },
      ),
    );
    return true;
  },
});
