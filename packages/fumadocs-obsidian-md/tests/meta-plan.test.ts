import { describe, expect, it } from "vitest";

import { type MetaPlan, planMeta } from "../src/meta-plan.js";

const files = [
  "a.md",
  "b.md",
  "c.md",
  "pic.png",
  "Guides/one.md",
  "Guides/two.md",
  "Pics/diagram.png",
];

function ok(plan: MetaPlan) {
  if (!plan.ok) throw new Error(plan.error);
  return plan;
}

function written(plan: MetaPlan, path: string) {
  const write = ok(plan).writes.find((w) => w.path === path);
  return write ? JSON.parse(write.content) : undefined;
}

describe("the first reorder of a folder", () => {
  it("creates a meta.json with the current order, ending with '...'", () => {
    const plan = planMeta({
      files,
      metas: {},
      changes: [{ type: "reorder", folder: "", from: 3, to: 0 }],
    });
    // Rows are folders first (Guides), then a, b, c; Pics holds no Note.
    // Moving row 3 (c) to row 0 puts it first.
    expect(written(plan, "meta.json")).toEqual({
      pages: ["c", "Guides", "a", "b", "..."],
    });
  });

  it("creates nested meta.json files at the folder's path", () => {
    const plan = planMeta({
      files,
      metas: {},
      changes: [{ type: "reorder", folder: "Guides", from: 1, to: 0 }],
    });
    expect(written(plan, "Guides/meta.json")).toEqual({
      pages: ["two", "one", "..."],
    });
  });

  it("fails on a row that is not there", () => {
    const plan = planMeta({
      files,
      metas: {},
      changes: [{ type: "reorder", folder: "Guides", from: 5, to: 0 }],
    });
    expect(plan.ok).toBe(false);
  });
});

describe("reordering in a hand-written meta.json", () => {
  const text = `{
    "title": "Guides",
    "icon": "Book",
    "pages": ["two", "[Docs](https://example.com)", "one", "!hidden", "..."]
}`;

  it("moves the items and keeps every key and entry it does not model", () => {
    const plan = planMeta({
      files,
      metas: { Guides: text },
      changes: [{ type: "reorder", folder: "Guides", from: 0, to: 1 }],
    });
    expect(written(plan, "Guides/meta.json")).toEqual({
      title: "Guides",
      icon: "Book",
      pages: ["[Docs](https://example.com)", "one", "two", "!hidden", "..."],
    });
  });

  it("writes nothing for a folder it did not change", () => {
    const plan = planMeta({
      files,
      metas: { Guides: text },
      changes: [{ type: "reorder", folder: "", from: 0, to: 1 }],
    });
    expect(ok(plan).writes.map((w) => w.path)).toEqual(["meta.json"]);
  });

  it("lists the items a '...' stood for, so a reorder can place them", () => {
    const plan = planMeta({
      files,
      metas: { Guides: `{"pages": ["two", "..."]}` },
      changes: [{ type: "reorder", folder: "Guides", from: 1, to: 0 }],
    });
    expect(written(plan, "Guides/meta.json")).toEqual({
      pages: ["one", "two", "..."],
    });
  });
});

describe("Separators", () => {
  it("adds one at a row, renames it and removes it", () => {
    const added = planMeta({
      files,
      metas: {},
      changes: [
        { type: "add-separator", folder: "Guides", title: "Start", index: 0 },
      ],
    });
    expect(written(added, "Guides/meta.json")).toEqual({
      pages: ["---Start---", "one", "two", "..."],
    });

    const renamed = planMeta({
      files,
      metas: {},
      changes: [
        { type: "add-separator", folder: "Guides", title: "Start", index: 0 },
        { type: "rename-separator", folder: "Guides", index: 0, title: "Go" },
      ],
    });
    expect(written(renamed, "Guides/meta.json")).toEqual({
      pages: ["---Go---", "one", "two", "..."],
    });

    const removed = planMeta({
      files,
      metas: {},
      changes: [
        { type: "add-separator", folder: "Guides", title: "Start", index: 1 },
        { type: "remove-separator", folder: "Guides", index: 1 },
      ],
    });
    expect(written(removed, "Guides/meta.json")).toEqual({
      pages: ["one", "two", "..."],
    });
  });

  it("appends a Separator when the row is past the end", () => {
    const plan = planMeta({
      files,
      metas: {},
      changes: [
        { type: "add-separator", folder: "Guides", title: "End", index: 2 },
      ],
    });
    expect(written(plan, "Guides/meta.json")).toEqual({
      pages: ["one", "two", "---End---", "..."],
    });
  });

  it("moves items under a Separator by reordering", () => {
    const plan = planMeta({
      files,
      metas: {},
      changes: [
        { type: "add-separator", folder: "Guides", title: "Late", index: 1 },
        { type: "reorder", folder: "Guides", from: 0, to: 2 },
      ],
    });
    expect(written(plan, "Guides/meta.json")).toEqual({
      pages: ["---Late---", "two", "one", "..."],
    });
  });

  it("refuses to rename or remove a row that is not a Separator", () => {
    for (const type of ["rename-separator", "remove-separator"] as const) {
      const plan = planMeta({
        files,
        metas: {},
        changes: [{ type, folder: "Guides", index: 0, title: "x" }],
      });
      expect(plan.ok).toBe(false);
    }
  });
});

describe("a folder's title", () => {
  it("sets the title of a folder that has no meta.json, without hiding its items", () => {
    const plan = planMeta({
      files,
      metas: {},
      changes: [{ type: "set-title", folder: "Guides", title: "How-to" }],
    });
    expect(written(plan, "Guides/meta.json")).toEqual({ title: "How-to" });
  });

  it("changes and clears the title, keeping the rest", () => {
    const text = `{"title":"Old","icon":"x","pages":["two","one"]}`;
    const changed = planMeta({
      files,
      metas: { Guides: text },
      changes: [{ type: "set-title", folder: "Guides", title: "New" }],
    });
    expect(written(changed, "Guides/meta.json")).toEqual({
      title: "New",
      icon: "x",
      pages: ["two", "one"],
    });
    const cleared = planMeta({
      files,
      metas: { Guides: text },
      changes: [{ type: "set-title", folder: "Guides", title: undefined }],
    });
    expect(written(cleared, "Guides/meta.json")).toEqual({
      icon: "x",
      pages: ["two", "one"],
    });
  });
});

describe("moves and renames keep pages in sync", () => {
  const metas = {
    "": `{"pages":["a","Guides","b","c"]}`,
    Guides: `{"pages":["one","two"]}`,
  };

  it("renames the entry in place", () => {
    const plan = planMeta({
      files,
      metas,
      changes: [{ type: "move", from: "b.md", to: "bee.md" }],
    });
    expect(written(plan, "meta.json")).toEqual({
      pages: ["a", "Guides", "bee", "c"],
    });
  });

  it("removes the entry from the old folder and lists the item in the new one", () => {
    const plan = planMeta({
      files,
      metas,
      changes: [{ type: "move", from: "b.md", to: "Guides/b.md" }],
    });
    expect(written(plan, "meta.json")).toEqual({
      pages: ["a", "Guides", "c"],
    });
    expect(written(plan, "Guides/meta.json")).toEqual({
      pages: ["one", "two", "b"],
    });
  });

  it("leaves a folder whose pages end with '...' to list the item itself", () => {
    const plan = planMeta({
      files,
      metas: { ...metas, Guides: `{"pages":["one","..."]}` },
      changes: [{ type: "move", from: "b.md", to: "Guides/b.md" }],
    });
    expect(written(plan, "Guides/meta.json")).toBeUndefined();
  });

  it("does nothing for a folder with no meta.json", () => {
    const plan = planMeta({
      files,
      metas: {},
      changes: [{ type: "move", from: "b.md", to: "Guides/b.md" }],
    });
    expect(ok(plan).writes).toEqual([]);
  });

  it("follows a renamed folder in its parent's pages", () => {
    const plan = planMeta({
      files,
      metas,
      changes: [{ type: "move", from: "Guides", to: "Manuals" }],
    });
    expect(written(plan, "meta.json")).toEqual({
      pages: ["a", "Manuals", "b", "c"],
    });
  });

  it("keeps a moved folder's own meta.json, which the planner moves with it", () => {
    const plan = planMeta({
      files,
      metas,
      changes: [
        { type: "move", from: "Guides", to: "Manuals" },
        { type: "set-title", folder: "Manuals", title: "Manuals" },
      ],
    });
    expect(written(plan, "Manuals/meta.json")).toEqual({
      title: "Manuals",
      pages: ["one", "two"],
    });
  });

  it("drops a folder's entry and meta.json once its last Note leaves", () => {
    const plan = planMeta({
      files,
      metas,
      changes: [
        { type: "move", from: "Guides/one.md", to: "one.md" },
        { type: "move", from: "Guides/two.md", to: "two.md" },
      ],
    });
    expect(written(plan, "meta.json")).toEqual({
      pages: ["a", "b", "c", "one", "two"],
    });
    expect(ok(plan).deletes).toEqual(["Guides/meta.json"]);
    expect(written(plan, "Guides/meta.json")).toBeUndefined();
  });

  it("lists a folder created by a move in a parent that names its items", () => {
    const plan = planMeta({
      files,
      metas,
      changes: [{ type: "move", from: "b.md", to: "Fresh/b.md" }],
    });
    expect(written(plan, "meta.json")).toEqual({
      pages: ["a", "Guides", "c", "Fresh"],
    });
  });

  it("ignores Assets and folders that hold no Note", () => {
    const plan = planMeta({
      files,
      metas,
      changes: [
        { type: "move", from: "pic.png", to: "Guides/pic.png" },
        { type: "move", from: "Pics", to: "Images" },
      ],
    });
    expect(ok(plan).writes).toEqual([]);
  });
});
