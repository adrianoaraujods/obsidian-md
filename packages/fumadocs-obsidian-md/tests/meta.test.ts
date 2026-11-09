import { describe, expect, it } from "vitest";

import {
  addSeparator,
  createMeta,
  moveEntry,
  readMeta,
  removeSeparator,
  renameSeparator,
  setTitle,
  writeMeta,
} from "../src/meta.js";

const handWritten = `{
    "title": "Guides",
    "icon": "Book",
    "defaultOpen": true,
    "pages": [
      "intro",
      "---Basics---",
      "install",
      "[Docs](https://example.com)",
      "...advanced",
      "!hidden",
      "z...a",
      "..."
    ]
}`;

describe("reading and writing a meta.json", () => {
  it("reads an unchanged file back as the same content in two-space JSON", () => {
    const out = writeMeta(handWritten, readMeta(handWritten));
    expect(JSON.parse(out)).toEqual(JSON.parse(handWritten));
    expect(out).toBe(`${JSON.stringify(JSON.parse(handWritten), null, 2)}\n`);
  });

  it("keeps unknown keys and unknown pages entries where they were", () => {
    const meta = moveEntry(readMeta(handWritten), 0, 2);
    const out = JSON.parse(writeMeta(handWritten, meta));
    expect(out.icon).toBe("Book");
    expect(out.defaultOpen).toBe(true);
    expect(Object.keys(out)).toEqual(["title", "icon", "defaultOpen", "pages"]);
    expect(out.pages).toEqual([
      "---Basics---",
      "install",
      "intro",
      "[Docs](https://example.com)",
      "...advanced",
      "!hidden",
      "z...a",
      "...",
    ]);
  });

  it("reads separators with their titles", () => {
    expect(readMeta(handWritten).entries[1]).toEqual({
      type: "separator",
      title: "Basics",
    });
  });

  it("rejects text that is not a JSON object", () => {
    expect(() => readMeta("[1]")).toThrow();
    expect(() => readMeta("{oops")).toThrow();
  });
});

describe("separators", () => {
  const base = readMeta(handWritten);

  it("adds, renames and removes a separator", () => {
    let meta = addSeparator(base, "Extras", 1);
    expect(writeMeta(handWritten, meta)).toContain('"---Extras---"');
    expect(JSON.parse(writeMeta(handWritten, meta)).pages[1]).toBe(
      "---Extras---",
    );
    meta = renameSeparator(meta, 1, "More");
    expect(JSON.parse(writeMeta(handWritten, meta)).pages[1]).toBe(
      "---More---",
    );
    meta = removeSeparator(meta, 1);
    expect(JSON.parse(writeMeta(handWritten, meta)).pages).toEqual(
      JSON.parse(handWritten).pages,
    );
  });

  it("refuses to rename or remove an entry that is not a separator", () => {
    expect(() => renameSeparator(base, 0, "x")).toThrow();
    expect(() => removeSeparator(base, 0)).toThrow();
  });

  it("reorders a separator like any entry", () => {
    const out = JSON.parse(writeMeta(handWritten, moveEntry(base, 1, 0)));
    expect(out.pages.slice(0, 2)).toEqual(["---Basics---", "intro"]);
  });
});

describe("title", () => {
  it("sets, changes and clears the title", () => {
    const set = writeMeta("{}", setTitle(readMeta("{}"), "Hello"));
    expect(JSON.parse(set).title).toBe("Hello");
    const cleared = writeMeta(set, setTitle(readMeta(set), undefined));
    expect("title" in JSON.parse(cleared)).toBe(false);
  });

  it("leaves a title-only file without a pages key", () => {
    const out = JSON.parse(
      writeMeta('{"title":"A"}', readMeta('{"title":"A"}')),
    );
    expect(out).toEqual({ title: "A" });
  });
});

describe("first reorder of a folder with no meta.json", () => {
  it("lists the current order and ends with the rest wildcard", () => {
    const meta = moveEntry(createMeta(["a", "b", "c"]), 2, 0);
    expect(JSON.parse(writeMeta(undefined, meta))).toEqual({
      pages: ["c", "a", "b", "..."],
    });
  });

  it("works the same for a nested folder's order", () => {
    const meta = addSeparator(createMeta(["x/y"]), "Deep", 0);
    expect(JSON.parse(writeMeta(undefined, meta)).pages).toEqual([
      "---Deep---",
      "x/y",
      "...",
    ]);
  });
});
