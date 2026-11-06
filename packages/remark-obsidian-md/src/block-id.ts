import type { Parent, Root, Text } from "mdast";
import type { Processor, Transformer } from "unified";
import type { Position } from "unist";
import { visit } from "unist-util-visit";

import { offsetBy } from "./utils.js";

/**
 * A Block ID is a `^id` marker at the end of a block, preceded by whitespace.
 * The charset is limited to letters, digits and hyphens.
 */
const BLOCK_ID = /\s\^([A-Za-z0-9-]+)\s*$/;

type Point = Position["start"];

/** Blocks keyed by Block ID (without the `^`). */
export type BlockIndex = Map<string, Parent>;

/**
 * Strips every trailing Block ID from the tree, annotates its block with
 * `id="^id"` and returns the resulting index.
 */
export function processBlockIds(tree: Root): BlockIndex {
  const blocks: BlockIndex = new Map();

  visit(tree, (node, _index, parent) => {
    if (
      node.type !== "paragraph" &&
      node.type !== "heading" &&
      node.type !== "tableCell"
    ) {
      return;
    }

    const last = node.children.at(-1);
    if (last?.type !== "text") return;

    const match = BLOCK_ID.exec(last.value);
    if (!match?.[1]) return;

    last.value = last.value.replace(BLOCK_ID, "");
    const position = splitBlockIdPosition(last, match[0], match[1]);

    // A Block ID at the end of a list item names the item, not its paragraph.
    const target =
      node.type === "paragraph" &&
      parent?.type === "listItem" &&
      parent.children.at(-1) === node
        ? parent
        : node;

    annotate(target, `^${match[1]}`, match[1], position);
    blocks.set(match[1], target);
  });

  return blocks;
}

/** Collects the Block IDs in a Note's raw markdown, for cross-Note references. */
export function scanBlockIds(markdown: string): Set<string> {
  const ids = new Set<string>();

  for (const line of markdown.split(/\r?\n/)) {
    const match = BLOCK_ID.exec(line);
    if (match?.[1]) ids.add(match[1]);
  }

  return ids;
}

export function remarkObsidianBlockIds(this: Processor): Transformer<Root> {
  return (tree) => {
    processBlockIds(tree);
  };
}

/**
 * Ends the text before the Block ID and returns the Block ID's own range.
 * The marker is plain characters at the end of the text, so its range counts
 * back from the text's end; a text without a source range yields none.
 */
function splitBlockIdPosition(
  text: Text,
  matched: string,
  id: string,
): Position | undefined {
  const end = text.position?.end;
  if (!text.position || !end || end.offset === undefined) return undefined;

  const trailing = matched.length - matched.trimEnd().length;
  const idEnd = offsetBy(end, -trailing);
  const idStart = offsetBy(idEnd, -(id.length + 1));

  // The whitespace before the marker is dropped from the text with it.
  if (matched[0] !== "\n")
    text.position = { start: text.position.start, end: offsetBy(idStart, -1) };

  return { start: idStart, end: idEnd };
}

function annotate(
  node: Parent,
  hid: string,
  id: string,
  position: Position | undefined,
): void {
  const data = node.data as
    | { hProperties?: Record<string, unknown> }
    | undefined;

  node.data = {
    ...data,
    // The Block ID's own range, for the editor: its text is stripped.
    ...(position ? { blockId: { id, position } } : {}),
    hProperties: { ...data?.hProperties, id: hid },
  };
}
