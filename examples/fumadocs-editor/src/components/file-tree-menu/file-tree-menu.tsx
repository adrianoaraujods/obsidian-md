"use client";

import { useEffect, useState } from "react";

import type { FolderRef } from "@/lib/file-tree-targets";
import { type MenuTarget, menuItemsFor } from "./items";
import { targetAt } from "./target-at";

type Open = { x: number; y: number; target: MenuTarget };

/**
 * Right-click menu on the sidebar's file tree: entries for a Note, a folder
 * and the root of the tree (see `MENU_ITEMS`). There is no sign-in in this
 * Example, so the menu is always there; its layout only mounts it where
 * editing is available.
 *
 * @param notes Note path by page URL, so a clicked link maps to its file.
 * @param folders The page tree's folders, so a clicked folder maps to its path.
 */
export function FileTreeMenu({
  notes,
  folders,
}: {
  notes: Record<string, string>;
  folders: FolderRef[];
}) {
  const [open, setOpen] = useState<Open | null>(null);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = targetAt(event.target as Element | null, notes, folders);
      if (!target) return;
      event.preventDefault();
      setOpen({ x: event.clientX, y: event.clientY, target });
    };
    const close = () => setOpen(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [notes, folders]);

  if (!open) return null;

  return (
    <div
      className="fixed z-50 min-w-36 rounded-md border border-fd-border bg-fd-popover p-1 text-sm shadow-lg"
      role="menu"
      style={{ left: open.x, top: open.y }}
    >
      {menuItemsFor(open.target.kind).map((item) => (
        <button
          className="block w-full rounded px-3 py-1.5 text-left hover:bg-fd-accent"
          key={item.id}
          onClick={() => {
            const { target } = open;
            setOpen(null);
            item.run(target);
          }}
          role="menuitem"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
