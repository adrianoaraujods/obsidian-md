"use client";

import { createStorageClient } from "codemirror-obsidian-md/storage/client";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth/client";
import { deleteNote } from "@/lib/delete-note";
import { DeleteDialog } from "./delete-dialog";
import { NOTE_MENU_ITEMS } from "./items";

type Open = { x: number; y: number; url: string; path: string };

/**
 * Right-click menu on the sidebar's file tree: Edit and Delete (see
 * `NOTE_MENU_ITEMS`). It renders nothing for a signed-out visitor, reading
 * the session in the browser so the Wiki's pages stay static.
 *
 * @param notes Note path by page URL, so a clicked link maps to its file.
 */
export function FileTreeMenu({ notes }: { notes: Record<string, string> }) {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState<Open | null>(null);
  const [deleting, setDeleting] = useState<Open | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const signedIn = Boolean(session);
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (!signedInRef.current) return;
      const link = (event.target as Element | null)?.closest?.(
        "#nd-sidebar a[href]",
      );
      if (!link) return;
      const url = new URL((link as HTMLAnchorElement).href, location.href)
        .pathname;
      const path = notes[url];
      if (!path) return;
      event.preventDefault();
      setOpen({ x: event.clientX, y: event.clientY, url, path });
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
  }, [notes]);

  if (!signedIn) return null;

  return (
    <>
      {open && (
        <div
          className="fixed z-50 min-w-36 rounded-md border border-fd-border bg-fd-popover p-1 text-sm shadow-lg"
          role="menu"
          style={{ left: open.x, top: open.y }}
        >
          {NOTE_MENU_ITEMS.map((item) => (
            <button
              className="block w-full rounded px-3 py-1.5 text-left hover:bg-fd-accent"
              key={item.id}
              onClick={() => {
                const target = open;
                setOpen(null);
                item.run({
                  path: target.path,
                  url: target.url,
                  close: () => setOpen(null),
                  requestDelete: () => setDeleting(target),
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
              deleting.path,
            );
            setDone(`Deleted ${deleting.path}`);
            setDeleting(null);
            setTimeout(() => setDone(null), 8000);
          }}
          path={deleting.path}
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
