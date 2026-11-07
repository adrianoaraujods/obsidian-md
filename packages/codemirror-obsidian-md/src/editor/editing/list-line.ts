import { stripCr } from "./line-text.js";

/** What kind of list marker a line starts with. */
export type ListKind = "bullet" | "numbered" | "quote";

/** One line of a Note, split into its list parts. */
export interface ListLine {
  kind: ListKind;
  /** Leading whitespace. */
  indent: string;
  /** The marker as written: `-`, `*`, `+`, `1.`, `1)`, or `>` (nested: `> >`). */
  marker: string;
  /** The number of a numbered item, else `null`. */
  number: number | null;
  /** The task state char (` `, `x`, ...) of a `[ ]` item, else `null`. */
  task: string | null;
  /** Whitespace between the marker and what follows it. */
  gap: string;
  /** The text after the marker; empty for an empty item. */
  content: string;
  /** Offset in the line where `content` starts. */
  contentStart: number;
}

const LIST = /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+)/;
const QUOTE = /^([ \t]*)((?:>[ \t]?)+)/;
const TASK = /^\[(.)\]([ \t]+|$)/;

/**
 * Parses a line (without its line break) as a list item, quote or Callout
 * line; `null` when it is none of them.
 */
export function parseListLine(line: string): ListLine | null {
  const text = stripCr(line);
  const list = LIST.exec(text);
  if (list) {
    const [whole, indent = "", bullet, digits, delimiter, gap = ""] = list;
    let contentStart = whole.length;
    let task: string | null = null;
    const box = TASK.exec(text.slice(contentStart));
    if (box) {
      task = box[1] ?? " ";
      contentStart += box[0].length;
    }
    return {
      kind: bullet ? "bullet" : "numbered",
      indent,
      marker: bullet ?? `${digits}${delimiter}`,
      number: digits ? Number(digits) : null,
      task,
      gap,
      content: text.slice(contentStart),
      contentStart,
    };
  }
  const quote = QUOTE.exec(text);
  if (quote) {
    const [whole, indent = "", markers = ""] = quote;
    return {
      kind: "quote",
      indent,
      marker: markers.trimEnd(),
      number: null,
      task: null,
      gap: markers.slice(markers.trimEnd().length),
      content: text.slice(whole.length),
      contentStart: whole.length,
    };
  }
  return null;
}

/** The prefix (indent, marker, task box) a continued line starts with. */
export function continuationPrefix(item: ListLine): string {
  const marker =
    item.kind === "numbered"
      ? `${(item.number ?? 0) + 1}${item.marker.slice(-1)}`
      : item.marker;
  const box = item.task === null ? "" : "[ ] ";
  return `${item.indent}${marker}${item.gap || " "}${box}`;
}
