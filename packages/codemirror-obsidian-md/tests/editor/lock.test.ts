// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSaveLock } from "../../src/editor/lock.js";
import { createSaveFlow } from "../../src/editor/save-flow.js";
import { StaleShaError } from "../../src/storage/errors.js";
import type { Storage } from "../../src/storage/types.js";

const MIN = 60_000;

function fakeStorage(
  opts: { lock?: boolean; noCommit?: boolean; stale?: boolean } = {},
) {
  const deployed = new Set<string>();
  const polls: string[] = [];
  let n = 0;
  const storage: Storage = {
    read: async () => ({ content: "remote", sha: "s0" }),
    write: async () => {
      if (opts.stale) throw new StaleShaError("note.md");
      n++;
      return { sha: `s${n}`, ...(opts.noCommit ? {} : { commit: `c${n}` }) };
    },
    create: async () => ({ sha: "x" }),
    delete: async () => {},
  };
  if (opts.lock !== false) {
    storage.lock = {
      isDeployed: async (c) => {
        polls.push(c);
        return deployed.has(c);
      },
    };
  }
  return { storage, deployed, polls };
}

function setup(
  opts: Parameters<typeof fakeStorage>[0] = {},
  timing: Partial<Parameters<typeof createSaveLock>[1]> = {},
  confirm?: Parameters<typeof createSaveFlow>[0]["confirm"],
) {
  const fake = fakeStorage(opts);
  const flow = createSaveFlow({
    storage: fake.storage,
    path: "note.md",
    content: "a",
    sha: "s0",
    getText: () => "b",
    ...(confirm ? { confirm } : {}),
  });
  const lock = createSaveLock(flow, { storage: fake.storage, ...timing });
  return { ...fake, flow, lock };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("save lock", () => {
  it("locks after a successful save and unlocks once deployed", async () => {
    const t = setup();
    expect(t.lock.state.status).toBe("unlocked");
    await t.flow.save();
    expect(t.lock.state.status).toBe("locked");

    await vi.advanceTimersByTimeAsync(MIN - 1);
    expect(t.polls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.polls).toEqual(["c1"]);
    expect(t.lock.state.status).toBe("locked");

    await vi.advanceTimersByTimeAsync(5000);
    expect(t.polls).toHaveLength(2);

    t.deployed.add("c1");
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.lock.state.status).toBe("unlocked");
    await vi.advanceTimersByTimeAsync(MIN);
    expect(t.polls).toHaveLength(3);
  });

  it("takes timing from props", async () => {
    const t = setup({}, { firstPollMs: 10, intervalMs: 2, timeoutMs: 20 });
    await t.flow.save();
    await vi.advanceTimersByTimeAsync(10);
    expect(t.polls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4);
    expect(t.polls).toHaveLength(3);
  });

  it("offers Reload and Keep waiting at the timeout", async () => {
    const t = setup();
    await t.flow.save();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(t.lock.state.status).toBe("timeout");
    const polled = t.polls.length;
    await vi.advanceTimersByTimeAsync(MIN);
    expect(t.polls).toHaveLength(polled);

    t.lock.keepWaiting();
    expect(t.lock.state.status).toBe("locked");
    t.deployed.add("c1");
    await vi.advanceTimersByTimeAsync(MIN);
    expect(t.lock.state.status).toBe("unlocked");
  });

  it("keep waiting times out again", async () => {
    const t = setup();
    await t.flow.save();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    t.lock.keepWaiting();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(t.lock.state.status).toBe("timeout");
  });

  it("reload from GitHub unlocks after the flow reloads", async () => {
    const t = setup();
    const reloaded = vi.fn();
    t.flow.onReload(reloaded);
    await t.flow.save();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(await t.lock.reload()).toBe(true);
    expect(reloaded).toHaveBeenCalledWith("remote");
    expect(t.lock.state.status).toBe("unlocked");
  });

  it("stays at the timeout when the reload is declined", async () => {
    const t = setup({}, {}, async (r) => r.kind !== "reload");
    await t.flow.save();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(await t.lock.reload()).toBe(false);
    expect(t.lock.state.status).toBe("timeout");
  });

  it("keeps polling when isDeployed throws", async () => {
    const t = setup();
    let fail = true;
    t.storage.lock = {
      isDeployed: async () => {
        if (fail) throw new Error("network");
        return true;
      },
    };
    await t.flow.save();
    await vi.advanceTimersByTimeAsync(MIN);
    expect(t.lock.state.status).toBe("locked");
    fail = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.lock.state.status).toBe("unlocked");
  });

  it("never locks without the lock capability", async () => {
    const t = setup({ lock: false });
    await t.flow.save();
    expect(t.lock.state).toEqual({ status: "unlocked", notice: null });
  });

  it("shows a one-time notice and does not lock without a build commit", async () => {
    const t = setup({ noCommit: true });
    await t.flow.save();
    expect(t.lock.state.status).toBe("unlocked");
    expect(t.lock.state.notice).toMatch(/commit/i);
    t.lock.dismissNotice();
    expect(t.lock.state.notice).toBeNull();
    await t.flow.save();
    expect(t.lock.state.notice).toBeNull();
  });

  it("a conflict never starts the lock", async () => {
    const t = setup({ stale: true });
    await t.flow.save();
    expect(t.flow.state.status).toBe("conflict");
    expect(t.lock.state.status).toBe("unlocked");
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(t.polls).toEqual([]);
  });

  it("dispose stops polling", async () => {
    const t = setup();
    await t.flow.save();
    t.lock.dispose();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(t.polls).toEqual([]);
  });
});
