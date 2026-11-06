import { describe, expect, it } from "vitest";

import { commitPreview } from "./commit-preview";

const ada = { name: "Ada Lovelace", login: "ada" };

describe("the commit a Save will make", () => {
  it("shows the subject and the read-only trailer, as the server writes them", () => {
    expect(commitPreview("Notes/a.md", ada)).toEqual({
      subject: "Update Notes/a.md",
      trailer:
        "Edited-with: obsidian-md editor\nEdited-by: Ada Lovelace (@ada)",
    });
  });

  it("names only the login when the profile has no name", () => {
    expect(commitPreview("a.md", { login: "ada" }).trailer).toBe(
      "Edited-with: obsidian-md editor\nEdited-by: @ada",
    );
  });

  it("collapses whitespace in the name, like the server", () => {
    expect(
      commitPreview("a.md", { name: "Ada\n  Lovelace", login: "ada" }).trailer,
    ).toContain("Edited-by: Ada Lovelace (@ada)");
  });
});
