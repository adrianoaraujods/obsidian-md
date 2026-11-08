import type { Storage } from "codemirror-obsidian-md/storage";
import { describe, expect, it, vi } from "vitest";

import { startDeployLock } from "../components/editor/deploy-lock";
import { createManagerFlow, lockedMessage } from "./manager-lock";

const COMMIT = "c".repeat(40);
const BUILD = "b".repeat(40);
const fast = { firstPollMs: 1000, intervalMs: 1000, timeoutMs: 5000 };

function storageDeployed(deployed: () => boolean) {
  return {
    lock: { isDeployed: async () => deployed() },
  } as unknown as Storage;
}

describe("the Manager's deploy lock", () => {
  it("starts locked when HEAD is ahead of the deployed build, whoever caused it", async () => {
    const { flow } = createManagerFlow(() => {});
    const lock = await startDeployLock(
      flow,
      storageDeployed(() => false),
      fast,
      async () => BUILD,
      COMMIT,
    );
    expect(lock.state.status).toBe("locked");
    lock.dispose();
  });

  it("locks after Apply on the commit Apply made, and unlocks when it is live", async () => {
    vi.useFakeTimers();
    let live = false;
    const { flow, applied } = createManagerFlow(() => {});
    const lock = await startDeployLock(
      flow,
      storageDeployed(() => live),
      fast,
      async () => BUILD,
    );
    expect(lock.state.status).toBe("unlocked");

    applied(COMMIT);
    expect(lock.state.status).toBe("locked");
    live = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(lock.state.status).toBe("unlocked");
    lock.dispose();
    vi.useRealTimers();
  });

  it("times out, then 'Reload from GitHub' reloads the page and unlocks", async () => {
    vi.useFakeTimers();
    const reloadPage = vi.fn();
    const { flow } = createManagerFlow(reloadPage);
    const lock = await startDeployLock(
      flow,
      storageDeployed(() => false),
      fast,
      async () => BUILD,
      COMMIT,
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(lock.state.status).toBe("timeout");

    await lock.reload();
    expect(reloadPage).toHaveBeenCalledOnce();
    expect(lock.state.status).toBe("unlocked");
    lock.dispose();
    vi.useRealTimers();
  });
});

describe("lockedMessage", () => {
  it("says the commit is yours when the Manager applied it in this session", () => {
    const message = lockedMessage({ ownCommit: true, timings: {} });
    expect(message).toContain("your commit is waiting");
    expect(message).toContain("the Wiki");
    expect(message).not.toMatch(/\bsite\b/i);
  });

  it("names a commit made outside this session without claiming it", () => {
    const message = lockedMessage({ ownCommit: false, timings: {} });
    expect(message).toContain("a commit made outside this page");
    expect(message).not.toContain("Your commit");
  });

  it("says when it unlocks from the Note editor's default timings", () => {
    const message = lockedMessage({ ownCommit: true, timings: {} });
    expect(message).toContain("about every 5 seconds");
    expect(message).toContain("up to 5 minutes");
    expect(message).toContain("reload");
  });

  it("follows overridden timings", () => {
    const message = lockedMessage({
      ownCommit: false,
      timings: { intervalMs: 10_000, timeoutMs: 60_000 },
    });
    expect(message).toContain("about every 10 seconds");
    expect(message).toContain("up to 1 minute");
  });
});
