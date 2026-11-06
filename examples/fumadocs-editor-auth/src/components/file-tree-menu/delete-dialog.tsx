"use client";

import { useState } from "react";

/**
 * Confirms deleting a Note. The Wiki is static, so the file tree and any
 * links keep showing the Note until the next redeploy, and no links are
 * rewritten.
 */
export function DeleteDialog({
  path,
  onConfirm,
  onCancel,
}: {
  path: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        aria-labelledby="delete-dialog-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-fd-border bg-fd-background p-5 shadow-xl"
        role="dialog"
      >
        <h2 className="mb-2 font-semibold text-lg" id="delete-dialog-title">
          Delete {path}?
        </h2>
        <p className="mb-3 text-sm">
          This commits the deletion to GitHub. The file tree keeps showing the
          Note until the next redeploy, and links are not rewritten: links to it
          stay broken.
        </p>
        {error && (
          <p className="mb-3 text-red-500 text-sm" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            className="rounded-md border border-fd-border px-3 py-1.5 text-sm"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-md border border-red-600 bg-red-600 px-3 py-1.5 font-medium text-sm text-white disabled:opacity-60"
            disabled={busy}
            onClick={confirm}
            type="button"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
