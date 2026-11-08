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

describe("buildTree with staged folders", () => {
  it("shows a staged folder that holds nothing yet, nested as typed", () => {
    const tree = buildTree(["a.md"], ["New/Inner"]);
    expect(tree).toEqual([
      {
        kind: "folder",
        name: "New",
        path: "New",
        children: [
          { kind: "folder", name: "Inner", path: "New/Inner", children: [] },
        ],
      },
      { kind: "file", name: "a.md", path: "a.md" },
    ]);
  });

  it("does not repeat a staged folder that something was moved into", () => {
    const tree = buildTree(["New/a.md"], ["New"]);
    expect(tree).toHaveLength(1);
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
  it("accepts a write of a whole file next to renames", () => {
    expect(
      parseCommitRequest({
        base: "abc",
        changeset: [
          { type: "rename", from: "a.md", to: "b.md" },
          { type: "write", path: "c.md", content: "[[b]]\n" },
        ],
      }),
    ).toEqual({
      base: "abc",
      changeset: [
        { type: "rename", from: "a.md", to: "b.md" },
        { type: "write", path: "c.md", content: "[[b]]\n" },
      ],
    });
  });

  it("refuses a write with no content or an unsafe path", () => {
    for (const change of [
      { type: "write", path: "c.md" },
      { type: "write", path: "../c.md", content: "x" },
      { type: "write", path: "/c.md", content: "x" },
      { type: "write", path: "c.md", content: 1 },
    ])
      expect(
        parseCommitRequest({ base: "abc", changeset: [change] }),
      ).toBeNull();
  });

  it("accepts only renames and writes, with a base", () => {
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
