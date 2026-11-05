import type { Storage } from "../storage/types.js";
import type { SaveFlow } from "./save-flow.js";

export type SaveLockStatus = "unlocked" | "locked" | "timeout";

export interface SaveLockState {
  /**
   * `locked`: a Save is waiting for its deploy, so the Note must not be
   * edited. `timeout`: the deploy did not appear in time; offer `reload()`
   * and `keepWaiting()`.
   */
  status: SaveLockStatus;
  /** One-time message, set when the host exposes no build commit. */
  notice: string | null;
}

export interface SaveLockOptions {
  storage: Storage;
  /** Delay before the first poll. Default 1 minute. */
  firstPollMs?: number;
  /** Delay between later polls. Default 5 seconds. */
  intervalMs?: number;
  /** Total wait, from the Save, before the timeout. Default 5 minutes. */
  timeoutMs?: number;
}

export interface SaveLock {
  readonly state: SaveLockState;
  subscribe(listener: (state: SaveLockState) => void): () => void;
  /** Timeout only: wait another `timeoutMs`. */
  keepWaiting(): void;
  /** Reload the Note from GitHub (through the flow's confirm), then unlock. */
  reload(): Promise<boolean>;
  dismissNotice(): void;
  dispose(): void;
}

export const NO_COMMIT_NOTICE =
  "Your host does not expose the build commit, so the editor cannot tell when your change is live. The Note is not locked.";

/**
 * Locks the Note after a successful Save until `storage.lock` reports the
 * deploy is live. Wired through `flow.onSaved`; conflicts and failed saves
 * never reach it, and a storage without `lock` is never locked.
 */
export function createSaveLock(
  flow: SaveFlow,
  options: SaveLockOptions,
): SaveLock {
  const { storage } = options;
  const firstPollMs = options.firstPollMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 300_000;

  let state: SaveLockState = { status: "unlocked", notice: null };
  let noticeShown = false;
  let commit = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  const listeners = new Set<(s: SaveLockState) => void>();

  function set(patch: Partial<SaveLockState>) {
    state = { ...state, ...patch };
    for (const l of [...listeners]) l(state);
  }

  function stop() {
    generation++;
    clearTimeout(timer);
    timer = undefined;
  }

  function start(newCommit: string) {
    stop();
    commit = newCommit;
    const gen = generation;
    const startedAt = Date.now();
    set({ status: "locked" });

    const poll = async () => {
      let deployed = false;
      try {
        deployed = (await storage.lock?.isDeployed(commit)) === true;
      } catch {
        // A failed check means "not yet"; keep polling until the timeout.
      }
      if (gen !== generation) return;
      if (deployed) return set({ status: "unlocked" });
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0) return set({ status: "timeout" });
      timer = setTimeout(poll, Math.min(intervalMs, remaining));
    };
    timer = setTimeout(poll, Math.min(firstPollMs, timeoutMs));
  }

  const offSaved = flow.onSaved((result) => {
    if (!storage.lock) return;
    if (result.commit === undefined) {
      if (!noticeShown) {
        noticeShown = true;
        set({ notice: NO_COMMIT_NOTICE });
      }
      return;
    }
    start(result.commit);
  });

  return {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    keepWaiting() {
      if (state.status === "timeout") start(commit);
    },
    async reload() {
      const ok = await flow.reload();
      if (ok) {
        stop();
        set({ status: "unlocked" });
      }
      return ok;
    },
    dismissNotice() {
      if (state.notice !== null) set({ notice: null });
    },
    dispose() {
      stop();
      offSaved();
      listeners.clear();
    },
  };
}
