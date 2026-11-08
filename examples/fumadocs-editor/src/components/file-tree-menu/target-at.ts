import { type FolderRef, resolveFolder } from "../../lib/file-tree-targets";
import type { MenuTarget } from "./items";

const label = (element: Element) => element.textContent?.trim() ?? "";

/**
 * A folder row of the Fumadocs sidebar is the first child of a collapsible
 * root; the folder's contents follow it in a sibling that has an `id`. The
 * contents (a wrapper sits inside them) hold the next level's roots the same
 * way, so the chain of rows up to the top gives the folder's names, outermost
 * first.
 */
function folderNames(row: Element): string[] | undefined {
  const root = row.parentElement;
  if (!root || root.id || !root.hasAttribute("data-state")) return;
  if (!row.nextElementSibling?.id || root.firstElementChild !== row) return;

  const names = [label(row)];
  let current: Element = root;
  for (;;) {
    const contents = current.parentElement?.closest(
      "#nd-sidebar [id][data-state]",
    );
    const outer = contents?.parentElement;
    const outerRow = outer?.firstElementChild;
    if (!outer || !outerRow) return names;
    names.unshift(label(outerRow));
    current = outer;
  }
}

/**
 * What a right-click in the sidebar landed on: a Note, a folder, or the empty
 * part of the File Tree (its root). Anything else, such as the sidebar's header
 * or footer, is not a target.
 *
 * @param notes Note path by page URL.
 * @param folders The page tree's folders, to map a clicked folder to its path.
 */
export function targetAt(
  element: Element | null,
  notes: Record<string, string>,
  folders: FolderRef[],
): MenuTarget | undefined {
  const sidebar = element?.closest("#nd-sidebar");
  if (!element || !sidebar) return;

  const row = element.closest("#nd-sidebar a[href], #nd-sidebar button");
  if (row) {
    const names = folderNames(row);
    if (names) {
      const path = resolveFolder(folders, names);
      return path === undefined ? undefined : { kind: "folder", path };
    }
    if (row instanceof HTMLAnchorElement) {
      const url = new URL(row.href, location.href).pathname;
      const path = notes[url];
      return path === undefined ? undefined : { kind: "note", path, url };
    }
    return;
  }
  return element.closest("[data-radix-scroll-area-viewport]")
    ? { kind: "root" }
    : undefined;
}
