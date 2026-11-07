import { addCursorAbove, addCursorBelow } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  keymap,
  rectangularSelection,
} from "@codemirror/view";

/**
 * Several cursors, with Obsidian's gestures (obsidian.md/help/multiple-cursors):
 * Alt-click (Option on macOS) adds one, Shift-Alt-drag or a middle-mouse drag
 * selects a rectangle, Ctrl-Alt-Up/Down (Cmd-Alt on macOS, CodeMirror's keys)
 * adds one above or below, and Escape collapses back to one. Editing applies
 * to every range.
 */
export function multiCursor(): Extension {
  return [
    EditorState.allowMultipleSelections.of(true),
    // The native selection can only show one range.
    drawSelection(),
    EditorView.clickAddsSelectionRange.of((event) => event.altKey),
    rectangularSelection({
      eventFilter: (event) =>
        (event.altKey && event.shiftKey && event.button === 0) ||
        event.button === 1,
    }),
    crosshairCursor({ key: "Alt" }),
    keymap.of([
      { key: "Mod-Alt-ArrowUp", run: addCursorAbove, preventDefault: true },
      { key: "Mod-Alt-ArrowDown", run: addCursorBelow, preventDefault: true },
    ]),
  ];
}
