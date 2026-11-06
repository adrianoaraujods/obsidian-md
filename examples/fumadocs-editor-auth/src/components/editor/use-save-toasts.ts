"use client";

import type { SaveFlow, SaveLock } from "codemirror-obsidian-md/editor";
import { useRouter } from "next/navigation";
import { useMemo, useRef } from "react";
import { toast } from "sonner";

import {
  deployToast,
  failureToast,
  type SaveToast,
  savedToast,
} from "@/lib/save-status";

export type SaveToasts = {
  /** Toasts for failures and for a Save that no deploy lock will track. */
  watchFlow(flow: SaveFlow, currentLock: () => SaveLock | null): () => void;
  /** Moves the Save's toast along as the deploy lock does. */
  watchLock(lock: SaveLock): () => void;
  dismiss(): void;
};

/**
 * The Note's Save toasts. One toast per Note, shown by the Save and updated in
 * place as the deploy lock moves, so "View note" only appears once the page is
 * live. `viewHref` is read when the action is clicked, so a new one never
 * rebuilds the toasts.
 */
export function useSaveToasts(
  path: string,
  noteName: string,
  viewHref: string,
) {
  const router = useRouter();
  const viewHrefRef = useRef(viewHref);
  viewHrefRef.current = viewHref;

  return useMemo<SaveToasts>(() => {
    const id = `save-${path}`;
    const show = (next: SaveToast) => {
      const options = {
        id,
        duration: next.kind === "loading" ? Number.POSITIVE_INFINITY : 8000,
        action: next.viewNote
          ? {
              label: "View note",
              onClick: () => router.push(viewHrefRef.current),
            }
          : null,
      };
      if (next.kind === "loading") toast.loading(next.message, options);
      else if (next.kind === "error") toast.error(next.message, options);
      else toast.success(next.message, options);
    };

    return {
      watchFlow(flow, currentLock) {
        let previous = flow.state.status;
        const offState = flow.subscribe((next) => {
          const failure =
            next.status === previous
              ? null
              : failureToast(next.status, noteName);
          previous = next.status;
          if (failure) show(failure);
        });
        // When the lock takes hold it shows its own "Waiting" toast in place
        // of this one, whichever of the two listeners runs first: the lock's
        // `locked` change lands after this check, or this check sees it.
        const offSaved = flow.onSaved(() => {
          if (currentLock()?.state.status !== "locked") {
            show(savedToast(noteName));
          }
        });
        return () => {
          offState();
          offSaved();
        };
      },
      watchLock(lock) {
        let from = lock.state.status;
        return lock.subscribe((next) => {
          const change = deployToast(from, next.status, noteName);
          from = next.status;
          if (change) show(change);
        });
      },
      dismiss: () => toast.dismiss(id),
    };
  }, [path, noteName, router]);
}
