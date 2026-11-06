import { describe, expect, it, vi } from "vitest";

import { deleteNote } from "./delete-note";

describe("deleteNote", () => {
  it("reads the current SHA, then deletes with it", async () => {
    const calls: string[] = [];
    const storage = {
      read: vi.fn(async (path: string) => {
        calls.push(`read ${path}`);
        return { sha: "abc123" };
      }),
      delete: vi.fn(async (path: string, sha: string) => {
        calls.push(`delete ${path} ${sha}`);
      }),
    };

    await deleteNote(storage, "Folder/Note.md");

    expect(calls).toEqual([
      "read Folder/Note.md",
      "delete Folder/Note.md abc123",
    ]);
  });

  it("does not delete when the read fails", async () => {
    const storage = {
      read: vi.fn().mockRejectedValue(new Error("boom")),
      delete: vi.fn(),
    };

    await expect(deleteNote(storage, "A.md")).rejects.toThrow("boom");
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
