import type { Node, PhrasingContent } from "mdast";
import type {
  Extension as FromMarkdownExtension,
  Token,
} from "mdast-util-from-markdown";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Extension as MicromarkExtension } from "micromark-util-types";
import type { Processor } from "unified";
import type { Position } from "unist";
import { visit } from "unist-util-visit";

/**
 * Parses a construct's content as inline Markdown with the extensions the
 * host pipeline carries, so every inline construct the Note supports works
 * inside it.
 *
 * The extensions the caller excludes are left out: a construct that excludes
 * itself keeps from nesting, and the Embed — a block construct — stays
 * literal.
 *
 * The content is inline only when it parses as a single paragraph; anything
 * else (a heading, a list) is block Markdown and stays literal text.
 * ponytail: inline content only; parse the content as a document and take its
 * phrasing children when block content is wanted.
 */
export function parseInlineContent(
  content: string,
  processor: Processor,
  exclude: readonly MicromarkExtension[],
): PhrasingContent[] | undefined {
  const data = processor.data() as Record<string, unknown>;
  const extensions = (
    (data.micromarkExtensions as MicromarkExtension[] | undefined) ?? []
  ).filter((extension) => !exclude.includes(extension));
  const mdastExtensions =
    (data.fromMarkdownExtensions as FromMarkdownExtension[] | undefined) ?? [];

  // A `%%` at the start of a line opens a block Comment; the space makes it
  // open an inline one instead. The space is dropped by the parse.
  const source = content.startsWith("%%") ? ` ${content}` : content;

  const tree = fromMarkdown(source, {
    extensions,
    mdastExtensions,
  });

  if (tree.children.length === 0) return [];
  if (tree.children.length !== 1) return undefined;

  const [child] = tree.children;
  if (child?.type !== "paragraph") return undefined;

  // Positions count from the content's start, without the added space.
  if (source !== content) {
    const unshift = (point: Position["start"]): Position["start"] => ({
      line: point.line,
      column: point.line === 1 ? point.column - 1 : point.column,
      offset: (point.offset ?? 0) - 1,
    });
    for (const node of child.children) {
      visit(node, (n) => {
        if (n.position) {
          n.position = {
            start: unshift(n.position.start),
            end: unshift(n.position.end),
          };
        }
      });
    }
  }

  return child.children;
}

/** Whether the phrasing content is plain text. */
export function isPlainText(children: PhrasingContent[]): boolean {
  return children.every((child) => child.type === "text");
}

/**
 * The content range of a construct: `start` and `end` are the deltas from
 * the construct's own start and end — the Footnote's content starts after
 * `^[` and ends before `]`, the Highlight's after `==` and before `==`.
 */
export function contentPosition(
  token: Token,
  start: number,
  end: number,
): Position {
  return {
    start: {
      line: token.start.line,
      column: token.start.column + start,
      offset: token.start.offset + start,
    },
    end: {
      line: token.end.line,
      column: token.end.column + end,
      offset: token.end.offset + end,
    },
  };
}

/**
 * Moves every descendant of a construct from the nested parse's own
 * coordinates (line 1, column 1, offset 0 is the content's start) into the
 * Note's, so each keeps the position of its own source. `position` is the
 * content range; only its start is used.
 */
export function applyContentPosition(node: Node, position: Position): void {
  const origin = position.start;
  const shift = (point: Position["start"]): Position["start"] => ({
    line: point.line + origin.line - 1,
    column: point.line === 1 ? point.column + origin.column - 1 : point.column,
    offset: (point.offset ?? 0) + (origin.offset ?? 0),
  });
  visit(node, (child) => {
    if (child === node || !child.position) return;
    child.position = {
      start: shift(child.position.start),
      end: shift(child.position.end),
    };
  });
}
