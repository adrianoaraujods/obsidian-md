import { manageHref, ROOT_FOCUS } from "../../lib/file-tree-targets";

/** What was right-clicked in the File Tree. */
export type MenuTarget =
  | {
      kind: "note";
      /** The Note's path relative to the Vault, e.g. `Folder/Note.md`. */
      path: string;
      /** The Note's page URL, e.g. `/folder/note`. */
      url: string;
    }
  | {
      kind: "folder";
      /** The folder's path relative to the Vault, e.g. `Folder/Sub`. */
      path: string;
    }
  | { kind: "root" };

export type MenuItem = {
  id: string;
  label: string;
  /** The kinds of target this item is offered for. */
  appliesTo: MenuTarget["kind"][];
  run: (target: MenuTarget) => void;
};

/**
 * The file tree's context menu entries, in display order. To add an item,
 * append an entry; the menu shows the ones that apply to what was clicked.
 * This Example saves to the local filesystem and has no create or delete
 * route, so the menu has no "New note here" or "Delete".
 */
export const MENU_ITEMS: MenuItem[] = [
  {
    id: "edit",
    label: "Edit",
    appliesTo: ["note"],
    run: (target) => {
      if (target.kind !== "note") return;
      location.assign(`/edit${target.url === "/" ? "" : target.url}`);
    },
  },
  {
    id: "rename-move",
    label: "Rename/Move…",
    appliesTo: ["note"],
    run: (target) => {
      if (target.kind === "note") location.assign(manageHref(target.path));
    },
  },
  {
    id: "reorder",
    label: "Reorder…",
    appliesTo: ["folder", "root"],
    run: (target) => {
      if (target.kind === "note") return;
      location.assign(
        manageHref(target.kind === "folder" ? target.path : ROOT_FOCUS),
      );
    },
  },
];

export function menuItemsFor(kind: MenuTarget["kind"]): MenuItem[] {
  return MENU_ITEMS.filter((item) => item.appliesTo.includes(kind));
}
