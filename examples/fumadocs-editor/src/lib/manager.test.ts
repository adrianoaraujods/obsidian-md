import { describe, expect, it } from "vitest";

import { buildTree, commitMessage, parseCommitRequest } from "./manager";

describe("buildTree", () => {
  it("nests files under folders, folders first, each sorted by name", () => {
    const tree = buildTree(["b.md", "Docs/z.md", "Docs/Deep/a.md", "a.md"]);
    expect(tree).toEqual([
      {
        kind: "folder",
        name: "Docs",
        path: "Docs",
        children: [
          {
            kind: "folder",
            name: "Deep",
            path: "Docs/Deep",
            children: [{ kind: "file", name: "a.md", path: "Docs/Deep/a.md" }],
          },
          { kind: "file", name: "z.md", path: "Docs/z.md" },
        ],
      },
      { kind: "file", name: "a.md", path: "a.md" },
      { kind: "file", name: "b.md", path: "b.md" },
    ]);
  });
});

describe("commitMessage", () => {
  it("joins subject, body and the read-only trailer", () => {
    expect(
      commitMessage({ subject: "Move a.md", body: "- Move a.md → D/a.md" }),
    ).toBe(
      "Move a.md\n\n- Move a.md → D/a.md\n\nEdited-with: obsidian-md editor",
    );
  });
});

describe("parseCommitRequest", () => {
  it("accepts only renames with a base", () => {
    expect(
      parseCommitRequest({
        base: "abc",
        changeset: [{ type: "rename", from: "a.md", to: "b.md" }],
      }),
    ).toEqual({
      base: "abc",
      changeset: [{ type: "rename", from: "a.md", to: "b.md" }],
    });
    expect(
      parseCommitRequest({
        base: "abc",
        changeset: [{ type: "delete", path: "a.md" }],
      }),
    ).toBeNull();
    expect(parseCommitRequest({ changeset: [] })).toBeNull();
  });
});
