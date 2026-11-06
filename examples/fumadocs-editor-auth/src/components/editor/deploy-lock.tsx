"use client";

import {
  createSaveLock,
  NO_COMMIT_NOTICE,
  type SaveFlow,
  type SaveLock,
  type SaveLockState,
} from "codemirror-obsidian-md/editor";
import type { Storage } from "codemirror-obsidian-md/storage";
import { useSyncExternalStore } from "react";

import type { LockTimings } from "@/lib/lock-timings";

const unlocked: SaveLockState = { status: "unlocked", notice: null };

async function fetchBuildSha(): Promise<string | null> {
  const response = await fetch("/api/build", { cache: "no-store" });
  if (!response.ok) throw new Error("build unavailable");
  return ((await response.json()) as { sha: string | null }).sha;
}

/** A lock that never locks: it only tells the person, once, why. */
function noticeOnlyLock(flow: SaveFlow): SaveLock {
  let state: SaveLockState = unlocked;
  let shown = false;
  const listeners = new Set<(s: SaveLockState) => void>();
  const set = (next: SaveLockState) => {
    state = next;
    for (const listener of [...listeners]) listener(state);
  };
  const offSaved = flow.onSaved(() => {
    if (shown) return;
    shown = true;
    set({ status: "unlocked", notice: NO_COMMIT_NOTICE });
  });
  return {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    keepWaiting() {},
    reload: () => flow.reload(),
    dismissNotice() {
      if (state.notice !== null) set(unlocked);
    },
    dispose() {
      offSaved();
      listeners.clear();
    },
  };
}

/**
 * The deploy lock for the authenticated Example. When `/api/build` reports no
 * commit (or cannot be reached) the host cannot tell us when a change is live,
 * so nothing locks and the person sees a one-time notice after their first
 * Save. `lockedCommit` starts the lock locked on a commit made before the
 * editor opened (a just-created Note). `storage` must have the `lock` capability (`createStorageClient({
 * lock: true })`).
 */
export async function startDeployLock(
  flow: SaveFlow,
  storage: Storage,
  timings: LockTimings = {},
  readBuildSha: () => Promise<string | null> = fetchBuildSha,
  lockedCommit?: string,
): Promise<SaveLock> {
  const sha = await readBuildSha().catch(() => null);
  if (!sha) return noticeOnlyLock(flow);
  return createSaveLock(flow, { storage, ...timings, lockedCommit });
}

/** The lock's current state, re-rendering on change. */
export function useLockState(lock: SaveLock | null): SaveLockState {
  return useSyncExternalStore(
    (onChange) => lock?.subscribe(onChange) ?? (() => {}),
    () => lock?.state ?? unlocked,
    () => unlocked,
  );
}

const button =
  "rounded-md border border-fd-border px-3 py-1.5 font-medium text-sm";

/** The locked state, the timeout choices, and the one-time notice. */
export function DeployLockPanel({ lock }: { lock: SaveLock | null }) {
  const { status, notice } = useLockState(lock);
  if (!lock) return null;

  return (
    <>
      {status === "locked" && (
        <p
          className="mb-3 rounded-md border border-fd-border bg-fd-muted px-3 py-2 text-sm"
          data-testid="lock-locked"
          role="status"
        >
          Saved. This Note is locked until your change is live on the site.
        </p>
      )}
      {status === "timeout" && (
        <div
          className="mb-3 rounded-md border border-fd-border bg-fd-muted px-3 py-2 text-sm"
          data-testid="lock-timeout"
          role="alert"
        >
          <p className="mb-2">
            Your change is not live yet. You can wait longer, or reload the Note
            from GitHub.
          </p>
          <div className="flex gap-2">
            <button
              className={button}
              onClick={() => lock.keepWaiting()}
              type="button"
            >
              Keep waiting
            </button>
            <button
              className={button}
              onClick={() => void lock.reload()}
              type="button"
            >
              Reload from GitHub
            </button>
          </div>
        </div>
      )}
      {notice !== null && (
        <p
          className="mb-3 flex items-start justify-between gap-2 rounded-md border border-fd-border bg-fd-muted px-3 py-2 text-sm"
          data-testid="lock-notice"
          role="status"
        >
          <span>{notice}</span>
          <button
            className="underline"
            onClick={() => lock.dismissNotice()}
            type="button"
          >
            Dismiss
          </button>
        </p>
      )}
    </>
  );
}
