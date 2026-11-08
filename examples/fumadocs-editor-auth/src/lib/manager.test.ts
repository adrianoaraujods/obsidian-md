import { describe, expect, it } from "vitest";

import {
  buildTree,
  commitMessage,
  describeChange,
  parseCommitRequest,
  planManager,
  vaultChangedMeanwhile,
} from "./manager";

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

  it("accepts only known changes, with a base", () => {
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
        changeset: [{ type: "explode", path: "a.md" }],
      }),
    ).toBeNull();
    expect(parseCommitRequest({ changeset: [] })).toBeNull();
  });
});

describe("planManager", () => {
  const files = ["a.md", "b.md", "Guides/one.md", "Guides/two.md", "pic.png"];
  const notes = { "a.md": "[[b]]\n", "b.md": "b\n" };

  it("commits a reorder as a created meta.json and says what it is", () => {
    const plan = planManager({
      files,
      metas: {},
      notes,
      changes: [{ type: "reorder", folder: "", from: 2, to: 0 }],
    });
    expect(plan).toMatchObject({
      ok: true,
      subject: "Reorganize 1 item",
      body: "- Reorder items in the Vault root",
    });
    if (!plan.ok) return;
    expect(plan.changeset).toEqual([
      {
        type: "write",
        path: "meta.json",
        content:
          '{\n  "pages": [\n    "b",\n    "Guides",\n    "a",\n    "..."\n  ]\n}\n',
      },
    ]);
    expect(plan.files).toEqual([...files].sort());
  });

  it("puts the rename and the pages updates in one changeset", () => {
    const plan = planManager({
      files,
      metas: {
        "": '{"pages":["a","b","Guides"]}',
        Guides: '{"pages":["one"]}',
      },
      notes,
      changes: [{ type: "move", from: "b.md", to: "Guides/b.md" }],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.subject).toBe("Move b.md");
    expect(plan.changeset.map((c) => c.type)).toEqual([
      "rename",
      "write",
      "write",
    ]);
    const paths = plan.changeset.flatMap((c) =>
      c.type === "write" ? [c.path] : [],
    );
    expect(paths.sort()).toEqual(["Guides/meta.json", "meta.json"]);
    // Sections: the Manager keeps meta.json out of the files it shows.
    expect(plan.files).toEqual([
      "Guides/b.md",
      "Guides/one.md",
      "Guides/two.md",
      "a.md",
      "pic.png",
    ]);
  });

  it("moves a folder's meta.json with it and deletes that of an emptied folder", () => {
    const moved = planManager({
      files,
      metas: { Guides: '{"title":"G"}' },
      notes,
      changes: [{ type: "move", from: "Guides", to: "Manuals" }],
    });
    expect(moved.ok && moved.changeset).toContainEqual({
      type: "rename",
      from: "Guides/meta.json",
      to: "Manuals/meta.json",
    });
    expect(moved.ok && moved.metaTexts).toEqual({ Manuals: '{"title":"G"}' });

    const emptied = planManager({
      files,
      metas: { Guides: '{"title":"G"}' },
      notes,
      changes: [
        { type: "move", from: "Guides/one.md", to: "one.md" },
        { type: "move", from: "Guides/two.md", to: "two.md" },
      ],
    });
    expect(emptied.ok && emptied.changeset).toContainEqual({
      type: "delete",
      path: "Guides/meta.json",
    });
    expect(emptied.ok && emptied.files).not.toContain("Guides/meta.json");
  });

  it("names a failed change by its place in the whole list", () => {
    const plan = planManager({
      files,
      metas: {},
      notes,
      changes: [
        { type: "reorder", folder: "", from: 0, to: 1 },
        { type: "move", from: "nope.md", to: "x.md" },
      ],
    });
    expect(plan).toMatchObject({ ok: false, index: 1 });
  });

  it("describes each kind of change", () => {
    expect(describeChange({ type: "set-title", folder: "G", title: "T" })).toBe(
      'Set the title of G to "T"',
    );
    expect(
      describeChange({ type: "set-title", folder: "G", title: undefined }),
    ).toBe("Clear the title of G");
    expect(
      describeChange({
        type: "add-separator",
        folder: "",
        title: "S",
        index: 0,
      }),
    ).toBe('Add Separator "S" in the Vault root');
  });
});

describe("parseCommitRequest with deletes", () => {
  it("accepts a delete", () => {
    expect(
      parseCommitRequest({
        base: "abc",
        changeset: [{ type: "delete", path: "G/meta.json" }],
      }),
    ).toEqual({
      base: "abc",
      changeset: [{ type: "delete", path: "G/meta.json" }],
    });
  });
});

describe("vaultChangedMeanwhile", () => {
  it("is true for the errors a commit that landed meanwhile causes", () => {
    for (const error of ["stale-base", "stale-sha", "already-exists"])
      expect(vaultChangedMeanwhile(error)).toBe(true);
  });

  it("is false for anything else", () => {
    for (const error of [undefined, "bad-request", "storage-failed"])
      expect(vaultChangedMeanwhile(error)).toBe(false);
  });
});
