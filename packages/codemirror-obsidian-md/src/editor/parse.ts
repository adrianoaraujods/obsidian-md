import type { Nodes, Parent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { remarkObsidianMd } from "remark-obsidian-md/syntax";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { Construct, NoteParser } from "./types.js";

/**
 * Node types the MVP shows as plain source (tables, fenced code, math,
 * Mermaid, reference footnotes). They are never emitted and never descended
 * into, so nothing inside them is decorated.
 */
export const PLAIN_SOURCE_TYPES: ReadonlySet<string> = new Set([
  "table",
  "code",
  "math",
  "inlineMath",
  "footnoteDefinition",
  "footnoteReference",
  "yaml",
]);

const FRONTMATTER =
  /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/** Length of the Frontmatter block at the top of `text` (0 if none). */
export function frontmatterLength(text: string): number {
  return FRONTMATTER.exec(text)?.[0].length ?? 0;
}

/**
 * Builds the parser from the plugin pipeline (ADR 0014): remark-parse,
 * remark-gfm and remark-obsidian-md. Only `parse` runs, never the plugin's
 * transform, so the tree keeps every construct (Comments included) at its
 * source position.
 */
export function createNoteParser(): NoteParser {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkObsidianMd);

  return (text) => {
    // Frontmatter is plain source; parsing it would turn `---` into rules.
    const offset = frontmatterLength(text);
    let tree: Nodes;
    try {
      tree = processor.parse(text.slice(offset));
    } catch {
      return [];
    }
    const out: Construct[] = [];
    walk(tree, offset, out);
    return out;
  };
}

function walk(node: Nodes, offset: number, out: Construct[]): void {
  if (PLAIN_SOURCE_TYPES.has(node.type)) return;
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (node.type !== "root" && start !== undefined && end !== undefined) {
    out.push({ type: node.type, from: start + offset, to: end + offset, node });
  }
  if ("children" in node) {
    for (const child of (node as Parent).children)
      walk(child as Nodes, offset, out);
  }
}
