import {
  EditorSelection,
  type SelectionRange,
  type Text,
} from "@codemirror/state";
import type { Command } from "@codemirror/view";

const MARKER_CHARS = ["*", "_"] as const;

/** How many `ch` repeat going away from `pos` (backward or forward). */
function markerRun(
  doc: Text,
  pos: number,
  dir: -1 | 1,
  ch: string,
  limit: number,
) {
  let n = 0;
  while (n < limit) {
    const at = dir < 0 ? pos - n - 1 : pos + n;
    if (at < 0 || at >= doc.length || doc.sliceString(at, at + 1) !== ch) break;
    n++;
  }
  return n;
}

/**
 * Finds the emphasis markers of `size` (2 bold, 1 italic) around a range,
 * either just outside the selection or at its own edges. A run of three is
 * bold and italic at once.
 */
function findMarkers(doc: Text, range: SelectionRange, size: 1 | 2) {
  const fits = (n: number) => (size === 2 ? n >= 2 : n % 2 === 1);
  for (const ch of MARKER_CHARS) {
    const outside = Math.min(
      markerRun(doc, range.from, -1, ch, 3),
      markerRun(doc, range.to, 1, ch, 3),
    );
    if (fits(outside)) {
      return { open: range.from - size, close: range.to, inside: false };
    }
  }
  if (range.empty) return null;
  const half = Math.floor((range.to - range.from) / 2);
  for (const ch of MARKER_CHARS) {
    const inside = Math.min(
      markerRun(doc, range.from, 1, ch, Math.min(3, half)),
      markerRun(doc, range.to, -1, ch, Math.min(3, half)),
    );
    if (fits(inside)) {
      return { open: range.from, close: range.to - size, inside: true };
    }
  }
  return null;
}

function toggle(marker: string): Command {
  const size = marker.length as 1 | 2;
  return (view) => {
    const { state } = view;
    view.dispatch(
      state.update(
        state.changeByRange((range) => {
          const found = findMarkers(state.doc, range, size);
          if (!found) {
            return {
              changes: [
                { from: range.from, insert: marker },
                { from: range.to, insert: marker },
              ],
              range: EditorSelection.range(range.from + size, range.to + size),
            };
          }
          // The selection lands on the inner text, in post-edit coordinates.
          const length = range.to - range.from - (found.inside ? 2 * size : 0);
          return {
            changes: [
              { from: found.open, to: found.open + size },
              { from: found.close, to: found.close + size },
            ],
            range: EditorSelection.range(found.open, found.open + length),
          };
        }),
        { userEvent: "input", scrollIntoView: true },
      ),
    );
    return true;
  };
}

export const toggleBold = toggle("**");
export const toggleItalic = toggle("_");
