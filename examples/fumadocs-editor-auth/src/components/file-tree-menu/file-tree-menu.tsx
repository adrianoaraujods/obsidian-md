"use client";

import { createStorageClient } from "codemirror-obsidian-md/storage/client";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth/client";
import { deleteNote } from "@/lib/delete-note";
import type { FolderRef } from "@/lib/file-tree-targets";
import { DeleteDialog } from "./delete-dialog";
import { type MenuTarget, menuItemsFor } from "./items";
import { targetAt } from "./target-at";

type Open = { x: number; y: number; target: MenuTarget };

/**
 * Right-click menu on the File Tree: entries for a Note, a folder
 * and the root of the tree (see `MENU_ITEMS`). It renders nothing for a
 * signed-out visitor, reading the session in the browser so the Wiki's pages
 * stay static.
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
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState<Open | null>(null);
  // Path of the Note whose Delete confirmation is open.
  const [deleting, setDeleting] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const signedIn = Boolean(session);
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (!signedInRef.current) return;
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

  if (!signedIn) return null;

  return (
    <>
      {open && (
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
                const target = open;
                setOpen(null);
                item.run(target.target, {
                  requestDelete: () => {
                    if (target.target.kind === "note")
                      setDeleting(target.target.path);
                  },
                });
              }}
              role="menuitem"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {deleting && (
        <DeleteDialog
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteNote(
              createStorageClient({ url: "/api/notes" }),
              deleting,
            );
            setDone(`Deleted ${deleting}`);
            setDeleting(null);
            setTimeout(() => setDone(null), 8000);
          }}
          path={deleting}
        />
      )}
      {done && (
        <div
          className="fixed right-4 bottom-4 z-50 rounded-md border border-fd-border bg-fd-background px-4 py-2 text-sm shadow-lg"
          role="status"
        >
          {done}
        </div>
      )}
    </>
  );
}
