"use client";

import type { SaveConfirmRequest } from "codemirror-obsidian-md/editor";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

const TABBABLE =
  "button:not([disabled]), textarea, input, [tabindex]:not([tabindex='-1'])";

/**
 * Wraps Tab at both ends of the dialog. Base UI's modal Dialog does not stop
 * Tab from reaching the page behind it (the focus-trap e2e fails without
 * this), so the dialog keeps focus itself.
 */
function trapTab(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(TABBABLE),
  ];
  const first = items[0];
  const last = items[items.length - 1];
  if (!(first && last)) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * The confirmation before a Save commits: the host's answer to the save
 * flow's `confirm` hook. It shows the commit subject and the read-only
 * trailer; the overwrite wording names who changed the Note and when.
 */
export function CommitDialog({ pending }: { pending: PendingConfirm }) {
  const { request, preview, resolve } = pending;

  return (
    <Dialog onOpenChange={(open) => !open && resolve(false)} open>
      <DialogContent className="sm:max-w-lg" onKeyDown={trapTab}>
        <DialogHeader>
          <DialogTitle>
            {request.kind === "reload" ? "Reload this note?" : "Commit changes"}
          </DialogTitle>
          <DialogDescription data-testid="commit-message">
            {request.message}
          </DialogDescription>
        </DialogHeader>

        {preview && (
          <div className="grid gap-2">
            <label className="font-medium text-sm" htmlFor="subject">
              Commit subject
            </label>
            <input
              className="w-full rounded-md border bg-muted px-2 py-1.5 font-mono text-sm"
              data-testid="commit-subject"
              id="subject"
              readOnly
              value={preview.subject}
            />
            <label className="font-medium text-sm" htmlFor="trailer">
              Trailer (added automatically)
            </label>
            <textarea
              className="w-full rounded-md border bg-muted px-2 py-1.5 font-mono text-sm"
              data-testid="commit-trailer"
              id="trailer"
              readOnly
              rows={2}
              value={preview.trailer}
            />
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => resolve(false)} variant="outline">
            Cancel
          </Button>
          <Button onClick={() => resolve(true)}>
            {CONFIRM_LABEL[request.kind]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
