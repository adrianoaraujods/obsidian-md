import type { Text } from "@codemirror/state";

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Whether `lineNumber` (1-based) sits in a fenced code block, including the
 * line that opens it. A fence closes on a line of the same character that is
 * at least as long and carries nothing else.
 */
export function inFencedCode(doc: Text, lineNumber: number): boolean {
  let open: string | null = null;
  for (let n = 1; n <= lineNumber; n++) {
    const match = FENCE.exec(doc.line(n).text.replace(/\r$/, ""));
    if (!match) continue;
    const [, run = "", rest = ""] = match;
    if (open === null) {
      if (run[0] === "`" && rest.includes("`")) continue;
      open = run;
      if (n === lineNumber) return true;
    } else if (
      run[0] === open[0] &&
      run.length >= open.length &&
      !rest.trim()
    ) {
      if (n === lineNumber) return true;
      open = null;
    }
  }
  return open !== null;
}
