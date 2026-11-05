import type { SaveFlow } from "codemirror-obsidian-md/editor";
import type { Storage } from "codemirror-obsidian-md/storage";
import { describe, expect, it, vi } from "vitest";

import { lockTimings } from "../../lib/lock-timings";
import { startDeployLock } from "./deploy-lock";

const COMMIT = "c".repeat(40);

function fakeFlow() {
  const listeners = new Set<(result: { commit?: string }) => void>();
  const flow = {
    onSaved: (listener: (result: { commit?: string }) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reload: async () => true,
  } as unknown as SaveFlow;
  return {
    flow,
    saved: (commit?: string) => {
      for (const l of listeners) l({ commit });
    },
  };
}

const storage = {
  lock: { isDeployed: async () => false },
} as unknown as Storage;

const buildOf = (sha: string | null) => async () => sha;
const fast = { firstPollMs: 1000, intervalMs: 1000, timeoutMs: 5000 };

describe("the deploy lock in the Example", () => {
  it("locks after a Save when the host exposes a build commit", async () => {
    const { flow, saved } = fakeFlow();
    const lock = await startDeployLock(
      flow,
      storage,
      fast,
      buildOf("a".repeat(40)),
    );
    saved(COMMIT);
    expect(lock.state.status).toBe("locked");
    lock.dispose();
  });

  it("shows a one-time notice and never locks when the build commit is null", async () => {
    const { flow, saved } = fakeFlow();
    const lock = await startDeployLock(flow, storage, fast, buildOf(null));
    saved(COMMIT);
    expect(lock.state.status).toBe("unlocked");
    expect(lock.state.notice).toMatch(/build commit/);

    lock.dismissNotice();
    saved(COMMIT);
    expect(lock.state.notice).toBeNull();
    expect(lock.state.status).toBe("unlocked");
  });

  it("treats an unreachable /api/build as no build commit", async () => {
    const { flow } = fakeFlow();
    const failing = vi.fn().mockRejectedValue(new Error("offline"));
    const lock = await startDeployLock(flow, storage, fast, failing);
    expect(lock.state.status).toBe("unlocked");
  });
});

describe("lockTimings", () => {
  it("defaults to the package's timings and reads overrides", () => {
    expect(lockTimings({})).toEqual({});
    expect(
      lockTimings({
        EDITOR_LOCK_FIRST_POLL_MS: "100",
        EDITOR_LOCK_INTERVAL_MS: "200",
        EDITOR_LOCK_TIMEOUT_MS: "3000",
      }),
    ).toEqual({ firstPollMs: 100, intervalMs: 200, timeoutMs: 3000 });
  });

  it("ignores values that are not positive numbers", () => {
    expect(lockTimings({ EDITOR_LOCK_TIMEOUT_MS: "soon" })).toEqual({});
  });
});
