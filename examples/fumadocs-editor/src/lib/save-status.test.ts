import { describe, expect, it } from "vitest";

import { failureMessage, savedMessage, statusLabel } from "./save-status";

const NOTE = "Alpha Note";

describe("the inline Save status", () => {
  it("reads All changes saved on a clean Note", () => {
    expect(statusLabel({ status: "idle", dirty: false })).toBe(
      "All changes saved",
    );
  });

  it("reads Unsaved changes while dirty", () => {
    expect(statusLabel({ status: "idle", dirty: true })).toBe(
      "Unsaved changes",
    );
  });

  it("reads Saving… while a Save is in flight", () => {
    expect(statusLabel({ status: "saving", dirty: true })).toBe("Saving…");
  });

  it("names a conflict and a failed Save", () => {
    expect(statusLabel({ status: "conflict", dirty: true })).toBe("Conflict");
    expect(statusLabel({ status: "error", dirty: true })).toBe("Save failed");
  });
});

describe("Save toasts", () => {
  it("names the Note in the success message", () => {
    expect(savedMessage(NOTE)).toBe("Saved Alpha Note");
  });

  it("raises an error toast for a failed Save and for a conflict", () => {
    expect(failureMessage("error", NOTE)).toBe("Could not save Alpha Note");
    expect(failureMessage("conflict", NOTE)).toBe(
      "Could not save Alpha Note: it changed elsewhere",
    );
  });

  it("says nothing for the other states", () => {
    expect(failureMessage("idle", NOTE)).toBeNull();
    expect(failureMessage("saving", NOTE)).toBeNull();
  });
});
