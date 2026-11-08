/** The part of a Fumadocs page tree node this file reads. */
export type TreeNodeLike = {
  type: string;
  name?: unknown;
  url?: string;
  index?: { url: string };
  children?: TreeNodeLike[];
};

/** A folder of the File Tree: its displayed name and its path in the Vault. */
export type FolderRef = { name: string; path: string; children: FolderRef[] };

/** `focus` value that names the root of the File Tree (Vault paths never start with `/`). */
export const ROOT_FOCUS = "/";

/** The URL of the first page under `node`, to learn which directory it sits in. */
function firstUrl(node: TreeNodeLike): string | undefined {
  if (node.index) return node.index.url;
  for (const child of node.children ?? []) {
    const url = child.type === "page" ? child.url : firstUrl(child);
    if (url) return url;
  }
}

/**
 * The folders of a page tree with their Vault paths. A folder node has no path
 * of its own (and its name may be a title from `meta.json`), so the path is the
 * leading directories of a Note inside it.
 *
 * @param notes Note path by page URL.
 */
export function folderRefs(
  nodes: TreeNodeLike[],
  notes: Record<string, string>,
  depth = 0,
): FolderRef[] {
  const refs: FolderRef[] = [];
  for (const node of nodes) {
    if (node.type !== "folder" || typeof node.name !== "string") continue;
    const url = firstUrl(node);
    const note = url === undefined ? undefined : notes[url];
    if (note === undefined) continue;
    refs.push({
      name: node.name,
      path: note
        .split("/")
        .slice(0, depth + 1)
        .join("/"),
      children: folderRefs(node.children ?? [], notes, depth + 1),
    });
  }
  return refs;
}

/**
 * The path of the folder reached by following `names` (outermost first). A name
 * is the row's text, which may start with the folder's `icon` printed as text,
 * so an exact match wins and otherwise the longest name the text ends with.
 */
export function resolveFolder(
  refs: FolderRef[],
  names: string[],
): string | undefined {
  let found: FolderRef | undefined;
  let level = refs;
  for (const name of names) {
    found =
      level.find((ref) => ref.name === name) ??
      level
        .filter((ref) => name.endsWith(ref.name))
        .sort((a, b) => b.name.length - a.name.length)[0];
    if (!found) return undefined;
    level = found.children;
  }
  return found?.path;
}

/** The Manager, with the item at `focus` (a Vault path, or `ROOT_FOCUS`) selected. */
export function manageHref(focus: string): string {
  return `/manage?${new URLSearchParams({ focus })}`;
}
