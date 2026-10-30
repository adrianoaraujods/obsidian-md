import type { Element, ElementContent, Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";

const HEADING = /^h([1-6])$/;

function headingLevel(node: ElementContent): number | undefined {
  if (node.type !== "element") return undefined;
  const match = HEADING.exec(node.tagName);
  return match ? Number(match[1]) : undefined;
}

function decode(subpath: string): string {
  try {
    return decodeURIComponent(subpath);
  } catch {
    return subpath;
  }
}

/** Finds the element with the given id, with the list of siblings holding it. */
function find(
  parent: Root | Element,
  id: string,
): {
  siblings: ElementContent[];
  index: number;
  parent: Root | Element;
} | null {
  const children = parent.children as ElementContent[];
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    if (node?.type !== "element") continue;
    if (node.properties.id === id) return { siblings: children, index, parent };
    const inner = find(node, id);
    if (inner) return inner;
  }
  return null;
}

/**
 * Cuts the part of a Note's rendered body that a link's Subpath points at.
 * `subpath` is the raw hash without `#`: a heading anchor (`alpha-heading`) or
 * a Block ID (`^blockid`). A heading selects itself and everything up to the
 * next heading of the same or higher level; a Block ID selects the one element
 * carrying `id="^blockid"` (a list item stays inside its list). When there is
 * no Subpath, or its anchor is not found, the whole Note comes back. Pure and
 * DOM-free: the input string is never mutated.
 */
export function slicePreviewHtml(
  html: string,
  subpath: string | undefined,
): string {
  if (!subpath) return html;

  const tree = fromHtml(html, { fragment: true });
  const anchor = decode(subpath);
  const hit = find(tree, anchor) ?? find(tree, subpath);
  if (!hit) return html;

  const node = hit.siblings[hit.index] as Element;
  const level = headingLevel(node);

  if (level !== undefined && !anchor.startsWith("^")) {
    let end = hit.index + 1;
    while (end < hit.siblings.length) {
      const next = headingLevel(hit.siblings[end] as ElementContent);
      if (next !== undefined && next <= level) break;
      end++;
    }
    return toHtml(hit.siblings.slice(hit.index, end));
  }

  if (node.tagName === "li" && hit.parent.type === "element") {
    return toHtml({ ...hit.parent, children: [node] });
  }
  return toHtml(node);
}
