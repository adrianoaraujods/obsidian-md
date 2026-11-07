import type { ChangeSpec } from "@codemirror/state";
import type { Command } from "@codemirror/view";

import { fencedLines } from "./code-fence.js";
import { parseListLine } from "./list-line.js";

/** Mod-Enter toggles the task on the list item at each cursor. */
export const toggleTask: Command = (view) => {
  const { state } = view;
  const fenced = fencedLines(state.doc);
  const seen = new Set<number>();
  const changes: ChangeSpec[] = [];
  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    if (seen.has(line.number) || fenced.has(line.number)) continue;
    seen.add(line.number);
    const item = parseListLine(line.text);
    if (!item || item.kind === "quote") continue;
    if (item.task === null) {
      changes.push({ from: line.from + item.contentStart, insert: "[ ] " });
      continue;
    }
    const box = item.indent.length + item.marker.length + item.gap.length;
    changes.push({
      from: line.from + box + 1,
      to: line.from + box + 2,
      insert: item.task === " " ? "x" : " ",
    });
  }
  if (changes.length)
    view.dispatch(state.update({ changes, userEvent: "input.toggle" }));
  return true;
};
