import type { ChangeSpec, EditorState } from "@codemirror/state";
import type { Command } from "@codemirror/view";

import { inFencedCode } from "./code-fence.js";
import { parseListLine } from "./list-line.js";

/** One indent level, as Obsidian writes it. */
const INDENT = "\t";

/** The line numbers (1-based) the selection touches, in order. */
function touchedLines(state: EditorState): number[] {
  const seen = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

/** The touched lines that are list items outside fenced code. */
function listItemLines(state: EditorState): number[] {
  return touchedLines(state).filter(
    (n) => parseListLine(state.doc.line(n).text) && !inFencedCode(state.doc, n),
  );
}

const LEADING = /^(?:\t| {1,4})/;

/** Columns of leading whitespace, a tab counting as four. */
function width(indent: string): number {
  let columns = 0;
  for (const ch of indent) columns += ch === "\t" ? 4 : 1;
  return columns;
}

/** The indent width of a list line, `null` for any other line. */
function levelOf(line: string | undefined): number | null {
  const item = line === undefined ? null : parseListLine(line);
  return item ? width(item.indent) : null;
}

/** Replaces the number of a numbered line, keeping the rest as written. */
function withNumber(line: string, number: number): string {
  return line.replace(/^([ \t]*)\d{1,9}/, `$1${number}`);
}

/**
 * Renumbers the numbered run the item at `index` belongs to: the consecutive
 * items at its indent, stepping over their deeper children. It counts up from
 * the run's first number, or from 1 when that first item was just moved.
 */
function renumberRun(lines: string[], index: number, moved: Set<number>) {
  const level = levelOf(lines[index]);
  if (level === null) return;
  let top = index;
  for (let i = index - 1; i >= 0; i--) {
    const at = levelOf(lines[i]);
    if (at === null || at < level) break;
    if (at === level) {
      if (parseListLine(lines[i]!)?.kind !== "numbered") break;
      top = i;
    }
  }
  const first = parseListLine(lines[top]!);
  if (first?.kind !== "numbered") return;
  let next = moved.has(top) ? 1 : (first.number ?? 1);
  for (let i = top; i < lines.length; i++) {
    const at = levelOf(lines[i]);
    if (at === null || at < level) break;
    if (at > level) continue;
    if (parseListLine(lines[i]!)?.kind !== "numbered") break;
    lines[i] = withNumber(lines[i]!, next++);
  }
}

/** The first line after `index` at `level`, past deeper lines; or -1. */
function followerAt(lines: string[], index: number, level: number): number {
  for (let i = index + 1; i < lines.length; i++) {
    const at = levelOf(lines[i]);
    if (at === null || at < level) return -1;
    if (at === level) return i;
  }
  return -1;
}

/** The edit turning `before` into `after`, trimmed to what differs. */
function lineEdit(from: number, before: string, after: string): ChangeSpec {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  return {
    from: from + start,
    to: from + before.length - end,
    insert: after.slice(start, after.length - end),
  };
}

function shiftLines(lineNumbers: number[], direction: 1 | -1): Command {
  return (view) => {
    const { state } = view;
    const before = state.doc.toString().split("\n");
    const lines = [...before];
    const moved = new Set<number>();
    const followers: number[] = [];
    for (const n of lineNumbers) {
      const i = n - 1;
      const text = lines[i]!;
      const oldLevel = levelOf(text) ?? width(/^[ \t]*/.exec(text)![0]);
      if (direction === 1) lines[i] = INDENT + text;
      else lines[i] = text.replace(LEADING, "");
      if (lines[i] === text) continue;
      moved.add(i);
      followers.push(followerAt(lines, i, oldLevel));
    }
    for (const i of followers) if (i >= 0) renumberRun(lines, i, moved);
    for (const i of moved) renumberRun(lines, i, moved);
    const changes: ChangeSpec[] = [];
    let from = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] !== before[i])
        changes.push(lineEdit(from, before[i]!, lines[i]!));
      from += before[i]!.length + 1;
    }
    if (changes.length)
      view.dispatch(state.update({ changes, userEvent: "input.indent" }));
    return true;
  };
}

/** Tab on a list item indents it. */
export const indentListItem: Command = (view) => {
  if (view.composing || view.compositionStarted) return false;
  const { state } = view;
  const items = listItemLines(state);
  return items.length > 0 && shiftLines(items, 1)(view);
};

/** Shift-Tab on a list item unindents it. */
export const unindentListItem: Command = (view) => {
  if (view.composing || view.compositionStarted) return false;
  const items = listItemLines(view.state);
  return items.length > 0 && shiftLines(items, -1)(view);
};

/** The touched lines that carry text, or the one line a cursor is on. */
function textLines(state: EditorState): number[] {
  const lines = touchedLines(state);
  const filled = lines.filter((n) => state.doc.line(n).text.trim());
  return lines.length === 1 ? lines : filled;
}

/** Mod-] indents every selected line, list or not. */
export const indentSelection: Command = (view) =>
  shiftLines(textLines(view.state), 1)(view);

/** Mod-[ unindents every selected line, list or not. */
export const unindentSelection: Command = (view) =>
  shiftLines(textLines(view.state), -1)(view);

/** Mod-Enter toggles the task on the list item at each cursor. */
export const toggleTask: Command = (view) => {
  const { state } = view;
  const seen = new Set<number>();
  const changes: ChangeSpec[] = [];
  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    if (seen.has(line.number) || inFencedCode(state.doc, line.number)) continue;
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
