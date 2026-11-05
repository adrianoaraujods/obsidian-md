import { describe, expect, it } from "vitest";

import { createdNoteHref, createdNoteMatches, folderOf } from "./new-note";

describe("createdNoteHref", () => {
  it("opens the editor on the new Note's slug and carries its path", () => {
    expect(createdNoteHref("Folder/My Note.md", ["Other.md"])).toBe(
      "/edit/folder/my-note?new=Folder%2FMy+Note.md",
    );
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
