import { isolateHistory } from "@codemirror/commands";
import { EditorSelection, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { isPairKey, pairRange } from "./auto-pair.js";
import { isComposing } from "./composition.js";
import { WRAP_CHARS, wrapRange } from "./selection-wrap.js";

export interface TypingOptions {
  /** Selection Wrap: a typed wrap character wraps a selected range. */
  wrap: boolean;
  /** Auto-pair: a typed opener inserts its closer at an empty range. */
  pair: boolean;
  /** `[[` -> `[[]]`, on its own when `pair` is off. */
  wikiLinkAutoClose: boolean;
}

/**
 * The typed-character behaviors. They share one input handler because each
 * range decides for itself: a non-empty range wraps (Selection Wrap) while an
 * empty one auto-pairs, in the same keystroke.
 */
export function typingBehaviors(options: TypingOptions): Extension {
  return EditorView.inputHandler.of((view, _from, _to, text) => {
    if (isComposing(view)) return false;
    const wraps = options.wrap && WRAP_CHARS.has(text);
    const pairs =
      (options.pair || options.wikiLinkAutoClose) && isPairKey(text);
    if (!wraps && !pairs) return false;
    const { state } = view;
    let handled = false;
    let wrapped = false;
    const transaction = state.changeByRange((range) => {
      if (!range.empty && wraps) {
        handled = wrapped = true;
        return wrapRange(range, text);
      }
      const paired =
        range.empty && pairs
          ? pairRange(state, range, text, options.pair)
          : null;
      if (paired) {
        handled = true;
        return paired;
      }
      // Anything else types as the default input would.
      return {
        changes: { from: range.from, to: range.to, insert: text },
        range: EditorSelection.cursor(range.from + text.length),
      };
    });
    if (!handled) return false;
    view.dispatch(transaction, {
      userEvent: "input.type",
      scrollIntoView: true,
      // Each wrap is its own undo step.
      ...(wrapped && { annotations: isolateHistory.of("full") }),
    });
    return true;
  });
}
