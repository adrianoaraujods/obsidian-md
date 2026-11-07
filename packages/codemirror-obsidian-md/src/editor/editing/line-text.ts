import type { EditorState } from "@codemirror/state";

/** A line's text without the `\r` of a CRLF line break. */
export function stripCr(text: string): string {
  return text.replace(/\r$/, "");
}

/** Where the line at `pos` ends, before any `\r` of a CRLF line break. */
export function contentEnd(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  return Math.min(pos, line.from + stripCr(line.text).length);
}
