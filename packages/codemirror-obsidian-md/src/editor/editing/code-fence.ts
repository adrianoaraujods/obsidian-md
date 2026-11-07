import type { Text } from "@codemirror/state";

import { stripCr } from "./line-text.js";

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * The lines (1-based) that sit in a fenced code block, including the lines
 * that open and close it. A fence closes on a line of the same character that
 * is at least as long and carries nothing else. One pass over the document,
 * so a command asks once and not per line.
 */
export function fencedLines(doc: Text): ReadonlySet<number> {
  const fenced = new Set<number>();
  let open: string | null = null;
  for (let n = 1; n <= doc.lines; n++) {
    const match = FENCE.exec(stripCr(doc.line(n).text));
    if (match) {
      const [, run = "", rest = ""] = match;
      if (open === null) {
        if (!(run[0] === "`" && rest.includes("`"))) {
          open = run;
          fenced.add(n);
          continue;
        }
      } else if (
        run[0] === open[0] &&
        run.length >= open.length &&
        !rest.trim()
      ) {
        fenced.add(n);
        open = null;
        continue;
      }
    }
    if (open !== null) fenced.add(n);
  }
  return fenced;
}
