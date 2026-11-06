import { describe, expect, it } from "vitest";

import {
  createdCommit,
  createdNoteHref,
  createdNoteMatches,
  folderOf,
} from "./new-note";

describe("createdNoteHref", () => {
  it("opens the editor on the new Note's slug and carries its path", () => {
    expect(createdNoteHref("Folder/My Note.md", ["Other.md"])).toBe(
      "/edit/folder/my-note?new=Folder%2FMy+Note.md",
    );
  });
});

describe("createdNoteHref with the create commit", () => {
  const commit = "b".repeat(40);

  it("carries the commit the lock waits for", () => {
    expect(createdNoteHref("My Note.md", [], commit)).toBe(
      `/edit/my-note?new=My+Note.md&commit=${commit}`,
    );
  });
});

describe("createdCommit", () => {
  it("accepts a full SHA only", () => {
    expect(createdCommit("b".repeat(40))).toBe("b".repeat(40));
    expect(createdCommit("nope")).toBeUndefined();
    expect(createdCommit(undefined)).toBeUndefined();
    expect(createdCommit(["a", "b"])).toBeUndefined();
  });
});

describe("createdNoteMatches", () => {
  it("accepts the path the slug was made from", () => {
    expect(
      createdNoteMatches(["folder", "my-note"], "Folder/My Note.md", []),
    ).toBe(true);
  });

  it("rejects a path that does not belong to the slug", () => {
    expect(createdNoteMatches(["other"], "Folder/My Note.md", [])).toBe(false);
    expect(createdNoteMatches(["x"], "../x.md", [])).toBe(false);
  });
});

describe("folderOf", () => {
  it("is the Note's folder, empty at the Vault root", () => {
    expect(folderOf("A/B/Note.md")).toBe("A/B");
    expect(folderOf("Note.md")).toBe("");
  });
});
