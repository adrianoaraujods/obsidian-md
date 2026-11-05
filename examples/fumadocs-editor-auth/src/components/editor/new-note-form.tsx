"use client";

import { createNewNoteScreen } from "codemirror-obsidian-md/new-note";
import { createStorageClient } from "codemirror-obsidian-md/storage/client";
import { useEffect, useRef, useState } from "react";

type Props = {
  /** Vault paths of the Notes in the build. */
  existingPaths: string[];
  /** Folder preset, e.g. from "New note here". */
  folder: string;
};

/**
 * The New-Note screen from the package, plus the confirmation before the
 * commit. Create never overwrites: GitHub refuses an existing path, and that
 * is shown here. No links are rewritten.
 */
export function NewNoteForm({ existingPaths, folder }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const screen = createNewNoteScreen({
      parent: host.current,
      existingPaths,
      folder,
      onCreate: (created) => {
        setError(null);
        setPath(created);
      },
      onCancel: () => history.back(),
    });
    return () => screen.destroy();
  }, [existingPaths, folder]);

  async function create(target: string) {
    setBusy(true);
    setError(null);
    try {
      await createStorageClient({ url: "/api/notes" }).create(target, "");
      location.assign(
        `/edit/new/open?${new URLSearchParams({ path: target })}`,
      );
    } catch (cause) {
      setError(
        (cause as { code?: string } | null)?.code === "already-exists"
          ? `${target} already exists. Nothing was changed.`
          : "Couldn't create the Note. Nothing was changed. Try again.",
      );
      setBusy(false);
      setPath(null);
    }
  }

  return (
    <div data-testid="new-note">
      <div className="new-note-host" ref={host} />
      {error && (
        <p data-testid="create-error" role="alert">
          {error}
        </p>
      )}
      {path && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            aria-labelledby="create-dialog-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-lg border border-fd-border bg-fd-background p-5 shadow-xl"
            role="dialog"
          >
            <h2 className="mb-2 font-semibold text-lg" id="create-dialog-title">
              Create {path}
            </h2>
            <p className="mb-2 text-sm">
              This commits <code>Create {path}</code> to GitHub. The file tree
              shows the old state until the next redeploy, so the new Note will
              not appear there yet.
            </p>
            <p className="mb-4 text-sm">
              Existing Notes are never overwritten, and no links are rewritten.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-md border border-fd-border px-3 py-1.5 text-sm"
                disabled={busy}
                onClick={() => setPath(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md border border-fd-primary bg-fd-primary px-3 py-1.5 font-medium text-fd-primary-foreground text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() => void create(path)}
                type="button"
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
