import type { SaveFlow } from "codemirror-obsidian-md/editor";

import type { LockTimings } from "./lock-timings";

/**
 * The slice of a Save flow the deploy lock uses, for a page with no Note
 * editor: `applied` stands in for a Save (call it with the commit Apply
 * made), and `reload` reloads the page from GitHub. Lets the Manager reuse the
 * Note editor's lock, with its timings, instead of a second one.
 */
export function createManagerFlow(reloadPage: () => void): {
  flow: SaveFlow;
  applied: (commit?: string) => void;
} {
  const listeners = new Set<(result: { commit?: string }) => void>();
  const flow = {
    onSaved(listener: (result: { commit?: string }) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async reload() {
      reloadPage();
      return true;
    },
  } as unknown as SaveFlow;
  return {
    flow,
    applied(commit) {
      for (const listener of [...listeners]) listener({ commit });
    },
  };
}

function span(ms: number): string {
  if (ms >= 60_000) {
    const minutes = Math.round(ms / 60_000);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

/**
 * Why the Manager is locked and when it unlocks. The check interval and the
 * wait before it offers to keep waiting or reload are the Note editor's
 * (`lockTimings`; 5 seconds and 5 minutes unless overridden).
 */
export function lockedMessage(options: {
  /** Whether the Manager made the waiting commit in this session. */
  ownCommit: boolean;
  timings: LockTimings;
}): string {
  const cause = options.ownCommit
    ? "Locked: your commit is waiting to go live on the Wiki, so what is shown here is out of date."
    : "Locked: a commit made outside this page (someone else's, or yours from earlier) is waiting to go live on the Wiki, so what is shown here is out of date.";
  const interval = span(options.timings.intervalMs ?? 5_000);
  const timeout = span(options.timings.timeoutMs ?? 300_000);
  return `${cause} The Manager checks about every ${interval} and unlocks once the Wiki is rebuilt with it. After up to ${timeout} it offers to keep waiting or reload from GitHub.`;
}
