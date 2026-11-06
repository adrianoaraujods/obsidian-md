// @vitest-environment jsdom
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSaveFlow,
  mountConflictBanner,
  type SaveConfirmRequest,
  type SaveFlow,
} from "../../src/editor/save-flow.js";
import { StaleShaError } from "../../src/storage/errors.js";
import { createFilesystemStorage } from "../../src/storage/filesystem.js";
import type { Storage } from "../../src/storage/types.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cm-save-flow-"));
  await writeFile(join(root, "note.md"), "original");
});
afterEach(() => rm(root, { recursive: true, force: true }));

async function open(
  over: {
    storage?: Storage;
    confirm?: (r: SaveConfirmRequest) => Promise<boolean>;
  } = {},
) {
  const storage = over.storage ?? createFilesystemStorage({ root });
  const file = await storage.read("note.md");
  const text = { value: file.content };
  const flow = createSaveFlow({
    storage,
    path: "note.md",
    content: file.content,
    sha: file.sha,
    getText: () => text.value,
    ...(over.confirm ? { confirm: over.confirm } : {}),
  });
  return { flow, text, storage };
}

const edit = (flow: SaveFlow, text: { value: string }, v: string) => {
  text.value = v;
  flow.textChanged(v);
};
const disk = () => readFile(join(root, "note.md"), "utf8");

describe("save", () => {
  it("writes through the storage and reports success", async () => {
    const { flow, text } = await open();
    edit(flow, text, "edited");
    const result = await flow.save();
    expect(result.ok).toBe(true);
    expect(await disk()).toBe("edited");
    expect(flow.state.dirty).toBe(false);
    expect(flow.state.status).toBe("idle");
  });

  it("asks the host to confirm and commits nothing when declined", async () => {
    const requests: SaveConfirmRequest[] = [];
    const { flow, text } = await open({
      confirm: async (r) => {
        requests.push(r);
        return false;
      },
    });
    edit(flow, text, "edited");
    const result = await flow.save();
    expect(result).toEqual({ ok: false, reason: "cancelled" });
    expect(requests[0]).toMatchObject({
      kind: "save",
      path: "note.md",
      text: "edited",
    });
    expect(await disk()).toBe("original");
    expect(flow.state.dirty).toBe(true);
  });

  it("reports unexpected errors without touching dirty state", async () => {
    const boom = new Error("offline");
    const { flow, text, storage } = await open();
    storage.write = async () => {
      throw boom;
    };
    edit(flow, text, "edited");
    const result = await flow.save();
    expect(result).toEqual({ ok: false, reason: "error", error: boom });
    expect(flow.state.status).toBe("error");
    expect(flow.state.dirty).toBe(true);
  });

  it("emits state changes and the saved commit for lock handling", async () => {
    const { flow, text, storage } = await open();
    const real = storage.write.bind(storage);
    storage.write = async (...a) => ({ ...(await real(...a)), commit: "c1" });
    const statuses: string[] = [];
    const saved = vi.fn();
    flow.subscribe((s) => statuses.push(s.status));
    flow.onSaved(saved);
    edit(flow, text, "edited");
    await flow.save();
    expect(statuses).toContain("saving");
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ commit: "c1" }),
    );
  });
});

describe("dirty state", () => {
  it("tracks dirty against the last saved text", async () => {
    const { flow, text } = await open();
    expect(flow.state.dirty).toBe(false);
    edit(flow, text, "x");
    expect(flow.state.dirty).toBe(true);
    edit(flow, text, "original");
    expect(flow.state.dirty).toBe(false);
  });

  it("warns before leaving the page only while dirty", async () => {
    const { flow, text } = await open();
    const detach = flow.attachBeforeUnload(window);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    edit(flow, text, "x");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    detach();
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});

describe("conflict", () => {
  async function conflicted(
    confirm?: (r: SaveConfirmRequest) => Promise<boolean>,
  ) {
    const ctx = await open(confirm ? { confirm } : {});
    await writeFile(join(root, "note.md"), "someone else");
    edit(ctx.flow, ctx.text, "mine");
    const result = await ctx.flow.save();
    return { ...ctx, result };
  }

  it("commits nothing, keeps the text and enters the conflict state", async () => {
    const { flow, text, result } = await conflicted();
    expect(result).toMatchObject({ ok: false, reason: "conflict" });
    expect(await disk()).toBe("someone else");
    expect(text.value).toBe("mine");
    expect(flow.state.status).toBe("conflict");
    expect(flow.state.dirty).toBe(true);
  });

  it("copies the user's text", async () => {
    const { flow } = await conflicted();
    const clipboard = { writeText: vi.fn(async () => {}) };
    await flow.copyText(clipboard);
    expect(clipboard.writeText).toHaveBeenCalledWith("mine");
  });

  it("reloads only after a confirm, replacing the text", async () => {
    const answers = [true];
    const requests: SaveConfirmRequest[] = [];
    const onReload = vi.fn();
    const ctx = await open({
      confirm: async (r) => {
        requests.push(r);
        return answers.shift() ?? true;
      },
    });
    ctx.flow.onReload(onReload);
    await writeFile(join(root, "note.md"), "someone else");
    edit(ctx.flow, ctx.text, "mine");
    await ctx.flow.save();
    answers.push(false, true);
    expect(await ctx.flow.reload()).toBe(false);
    expect(onReload).not.toHaveBeenCalled();
    expect(await ctx.flow.reload()).toBe(true);
    expect(requests.at(-1)?.kind).toBe("reload");
    expect(onReload).toHaveBeenCalledWith("someone else");
    expect(ctx.flow.state.status).toBe("idle");
    expect(ctx.flow.state.dirty).toBe(false);
  });

  it("overwrite re-runs save through the dialog, reworded with the newer commit", async () => {
    const requests: SaveConfirmRequest[] = [];
    const base = createFilesystemStorage({ root });
    const storage: Storage = {
      ...base,
      write: async (p, c, s) => {
        try {
          return await base.write(p, c, s);
        } catch (e) {
          if (e instanceof StaleShaError) {
            throw new StaleShaError(p, {
              author: "Ada",
              time: "2026-01-02T03:04:05Z",
            });
          }
          throw e;
        }
      },
    };
    const { flow, text } = await open({
      storage,
      confirm: async (r) => {
        requests.push(r);
        return true;
      },
    });
    await writeFile(join(root, "note.md"), "someone else");
    edit(flow, text, "mine");
    await flow.save();
    const result = await flow.overwrite();
    expect(result.ok).toBe(true);
    expect(await disk()).toBe("mine");
    const last = requests.at(-1);
    expect(last?.kind).toBe("overwrite");
    expect(last?.newer).toEqual({
      author: "Ada",
      time: "2026-01-02T03:04:05Z",
    });
    expect(last?.message).toContain("Ada");
    expect(last?.message).toContain("2026-01-02T03:04:05Z");
    expect(requests[0]?.message).not.toBe(last?.message);
    expect(flow.state.status).toBe("idle");
  });

  it("a second conflict returns to the banner", async () => {
    const { flow, storage } = await conflicted();
    const real = storage.read.bind(storage);
    storage.read = async (p) => {
      const f = await real(p);
      await writeFile(join(root, "note.md"), "racing");
      return f;
    };
    const result = await flow.overwrite();
    expect(result).toMatchObject({ ok: false, reason: "conflict" });
    expect(flow.state.status).toBe("conflict");
    expect(await disk()).toBe("racing");
  });

  it("declining the overwrite dialog stays on the banner", async () => {
    const answers = [true, false];
    const { flow } = await conflicted(async () => answers.shift() ?? true);
    expect(await flow.overwrite()).toEqual({ ok: false, reason: "cancelled" });
    expect(flow.state.status).toBe("conflict");
  });

  it("renders a banner with Copy my text, Reload and Overwrite while in conflict", async () => {
    const { flow, text } = await open();
    const parent = document.createElement("div");
    const unmount = mountConflictBanner(flow, parent, {
      clipboard: { writeText: vi.fn(async () => {}) },
    });
    expect(parent.querySelector("[data-save-flow-banner]")).toBeNull();
    await writeFile(join(root, "note.md"), "someone else");
    edit(flow, text, "mine");
    await flow.save();
    const labels = [...parent.querySelectorAll("button")].map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(["Copy my text", "Reload", "Overwrite"]);
    parent
      .querySelector<HTMLButtonElement>('[data-action="overwrite"]')
      ?.click();
    await vi.waitFor(() => expect(flow.state.status).toBe("idle"));
    expect(parent.querySelector("[data-save-flow-banner]")).toBeNull();
    unmount();
  });
});
