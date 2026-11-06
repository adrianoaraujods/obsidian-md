"use client";

import type { SaveConfirmRequest } from "codemirror-obsidian-md/editor";

export type PendingConfirm = {
  request: SaveConfirmRequest;
  /** The commit about to be made; `null` for a reload (nothing is committed). */
  preview: { subject: string; trailer: string } | null;
  resolve: (confirmed: boolean) => void;
};

const CONFIRM_LABEL = {
  save: "Commit",
  overwrite: "Overwrite",
  reload: "Reload",
} as const;

/**
 * The confirmation before a Save commits: the host's answer to the save
 * flow's `confirm` hook. It shows the commit subject and the read-only
 * trailer; the overwrite wording names who changed the Note and when.
 */
export function CommitDialog({ pending }: { pending: PendingConfirm }) {
  const { request, preview, resolve } = pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        aria-labelledby="commit-dialog-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-fd-border bg-fd-background p-5 shadow-xl"
        role="dialog"
      >
        <h2 className="mb-2 font-semibold text-lg" id="commit-dialog-title">
          {request.kind === "reload" ? "Reload this note?" : "Commit changes"}
        </h2>
        <p className="mb-3 text-sm" data-testid="commit-message">
          {request.message}
        </p>

        {preview && (
          <>
            <label className="mb-1 block font-medium text-sm" htmlFor="subject">
              Commit subject
            </label>
            <input
              className="mb-3 w-full rounded-md border border-fd-border bg-fd-muted px-2 py-1.5 font-mono text-sm"
              data-testid="commit-subject"
              id="subject"
              readOnly
              value={preview.subject}
            />
            <label className="mb-1 block font-medium text-sm" htmlFor="trailer">
              Trailer (added automatically)
            </label>
            <textarea
              className="mb-4 w-full rounded-md border border-fd-border bg-fd-muted px-2 py-1.5 font-mono text-sm"
              data-testid="commit-trailer"
              id="trailer"
              readOnly
              rows={2}
              value={preview.trailer}
            />
          </>
        )}

        <div className="flex justify-end gap-2">
          <button
            className="rounded-md border border-fd-border px-3 py-1.5 text-sm"
            onClick={() => resolve(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-md border border-fd-primary bg-fd-primary px-3 py-1.5 font-medium text-fd-primary-foreground text-sm"
            onClick={() => resolve(true)}
            type="button"
          >
            {CONFIRM_LABEL[request.kind]}
          </button>
        </div>
      </div>
    </div>
  );
}
