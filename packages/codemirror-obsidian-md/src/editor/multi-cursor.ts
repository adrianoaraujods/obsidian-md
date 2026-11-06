import { addCursorAbove, addCursorBelow } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  keymap,
  rectangularSelection,
} from "@codemirror/view";

/**
 * Several cursors, as in Obsidian: Ctrl/Cmd-click adds one, Alt-drag selects
 * a rectangle, Ctrl-Alt-Up/Down (Cmd-Alt on macOS) adds one above or below,
 * and Escape collapses back to one. Editing applies to every range.
 *
 * The click modifier is CodeMirror's default (`clickAddsSelectionRange`:
 * Cmd on macOS, Ctrl elsewhere); Obsidian's own is unverified.
 */
export function multiCursor(): Extension {
  return [
    EditorState.allowMultipleSelections.of(true),
    // The native selection can only show one range.
    drawSelection(),
    rectangularSelection(),
    crosshairCursor(),
    keymap.of([
      { key: "Mod-Alt-ArrowUp", run: addCursorAbove, preventDefault: true },
      { key: "Mod-Alt-ArrowDown", run: addCursorBelow, preventDefault: true },
    ]),
  ];
}
