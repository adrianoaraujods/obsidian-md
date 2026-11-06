import { describe, expect, it } from "vitest";

import { deployToast, savedToast, statusLabel } from "./save-status";

const clean = { status: "idle", dirty: false } as const;

describe("the inline Save status", () => {
  it("reads All changes saved on a clean Note that was not saved here", () => {
    expect(statusLabel(clean, "unlocked", false)).toBe("All changes saved");
  });

  it("reads Unsaved changes while dirty", () => {
    expect(
      statusLabel({ status: "idle", dirty: true }, "unlocked", false),
    ).toBe("Unsaved changes");
  });

  it("reads Saving… while a Save is in flight", () => {
    expect(
      statusLabel({ status: "saving", dirty: true }, "unlocked", false),
    ).toBe("Saving…");
  });

  it("names a conflict and a failed Save", () => {
    expect(
      statusLabel({ status: "conflict", dirty: true }, "unlocked", true),
    ).toBe("Conflict");
    expect(
      statusLabel({ status: "error", dirty: true }, "unlocked", true),
    ).toBe("Save failed");
  });

  it("reads Saved, deploying while the deploy lock holds, then Saved", () => {
    expect(statusLabel(clean, "locked", true)).toBe("Saved, deploying");
    expect(statusLabel(clean, "unlocked", true)).toBe("Saved");
    expect(statusLabel(clean, "timeout", true)).toBe("Saved");
  });
});

describe("the deploy-aware toast", () => {
  it("waits for the deploy once the lock takes hold, with no action", () => {
    expect(deployToast("unlocked", "locked", "Alpha Note")).toEqual({
      kind: "loading",
      message: "Committed. Waiting for the deploy…",
      action: false,
    });
  });

  it("becomes Deployed with a View note action when the lock clears", () => {
    expect(deployToast("locked", "unlocked", "Alpha Note")).toEqual({
      kind: "success",
      message: "Deployed",
      action: true,
    });
  });

  it("offers no action when the lock times out", () => {
    const toast = deployToast("locked", "timeout", "Alpha Note");
    expect(toast?.action).toBe(false);
    expect(toast?.message).toMatch(/Alpha Note/);
  });

  it("goes back to waiting when the person keeps waiting", () => {
    expect(deployToast("timeout", "locked", "Alpha Note")?.message).toBe(
      "Committed. Waiting for the deploy…",
    );
  });

  it("says nothing for a reload out of a timeout or an unchanged lock", () => {
    expect(deployToast("timeout", "unlocked", "Alpha Note")).toBeNull();
    expect(deployToast("locked", "locked", "Alpha Note")).toBeNull();
  });

  it("confirms a Save the host cannot track, with no action", () => {
    expect(savedToast("Alpha Note")).toEqual({
      kind: "success",
      message: "Saved Alpha Note",
      action: false,
    });
  });
});
