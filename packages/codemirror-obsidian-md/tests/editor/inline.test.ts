// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  blockIdParser,
  createEditor,
  type EditorHandle,
  inlineProviders,
} from "../../src/editor/index.js";
import { decorationsField } from "../../src/editor/state.js";

const handles: EditorHandle[] = [];
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
});

interface Deco {
  from: number;
  to: number;
  hidden: boolean;
  cls: string;
  tagName?: string;
  attributes?: Record<string, string>;
}

function mount(doc: string, cursor: number): EditorHandle {
  const parent = document.createElement("div");
  document.body.append(parent);
  const handle = createEditor({
    parent,
    doc,
    providers: inlineProviders,
    parser: blockIdParser(),
  });
  handles.push(handle);
  handle.view.dispatch({ selection: { anchor: cursor } });
  return handle;
}

/** Mounts `doc` with the cursor at `cursor` and lists its decorations. */
function decorate(doc: string, cursor: number): Deco[] {
  const handle = mount(doc, cursor);
  const out: Deco[] = [];
  handle.view.state
    .field(decorationsField)
    .between(0, doc.length, (from, to, value) => {
      const spec = value.spec as {
        class?: string;
        tagName?: string;
        attributes?: Record<string, string>;
      };
      out.push({
        from,
        to,
        hidden: !spec.tagName && !spec.class,
        cls: spec.class ?? "",
        tagName: spec.tagName,
        attributes: spec.attributes,
      });
    });
  return out;
}
const hidden = (ds: Deco[]) =>
  ds.filter((d) => d.hidden).map((d) => [d.from, d.to]);
const marks = (ds: Deco[]) => ds.filter((d) => !d.hidden);

describe("Wiki Link", () => {
  const doc = "a [[Note|Alias]] b";
  it("renders the label as a link with the markers hidden when the cursor is outside", () => {
    const ds = decorate(doc, 0);
    expect(hidden(ds)).toEqual([
      [2, 9],
      [14, 16],
    ]);
    expect(marks(ds)).toEqual([
      expect.objectContaining({
        from: 9,
        to: 14,
        tagName: "a",
        attributes: expect.objectContaining({ class: "internal-link" }),
      }),
    ]);
  });
  it("hides only the brackets when there is no alias", () => {
    const ds = decorate("x [[Note]]\ny", 11);
    expect(hidden(ds)).toEqual([
      [2, 4],
      [8, 10],
    ]);
  });
  it("reveals the raw syntax with the cursor inside", () => {
    expect(hidden(decorate(doc, 5))).toEqual([]);
  });
});

describe("Highlight", () => {
  it("renders as a mark with the markers hidden outside", () => {
    const ds = decorate("a ==hi== b", 0);
    expect(hidden(ds)).toEqual([
      [2, 4],
      [6, 8],
    ]);
    expect(marks(ds)).toEqual([
      expect.objectContaining({ from: 4, to: 6, tagName: "mark" }),
    ]);
    expect(marks(ds)[0]?.attributes?.["data-highlight"]).toBeUndefined();
  });
  it("renders the Highlight Color like the Wiki", () => {
    const ds = decorate("==🟡hi== x", 10);
    expect(hidden(ds)).toEqual([
      [0, 4],
      [6, 8],
    ]);
    expect(marks(ds)[0]).toMatchObject({
      from: 4,
      to: 6,
      tagName: "mark",
      attributes: expect.objectContaining({ "data-highlight": "yellow" }),
    });
  });
  it("ignores an emoji that is not a Highlight Color", () => {
    const ds = decorate("==😀hi== x", 10);
    expect(marks(ds)[0]?.attributes?.["data-highlight"]).toBeUndefined();
    expect(hidden(ds)).toEqual([
      [0, 2],
      [6, 8],
    ]);
  });
  it("reveals inside", () => {
    expect(hidden(decorate("a ==hi== b", 5))).toEqual([]);
  });
});

describe("Comment", () => {
  it("is hidden outside", () => {
    expect(hidden(decorate("a %%secret%% b", 0))).toEqual([[2, 12]]);
  });
  it("reveals inside", () => {
    expect(hidden(decorate("a %%secret%% b", 6))).toEqual([]);
  });
});

describe("Wiki Link inside a Highlight", () => {
  // a ==see [[Wiki Links]]== b
  // 0         1         2
  // 0123456789012345678901234
  const doc = "a ==see [[Wiki Links]]== b";
  it("renders the Highlight around the rendered link when the cursor is outside", () => {
    const ds = decorate(doc, doc.length);
    expect(hidden(ds).sort((a, b) => a[0] - b[0])).toEqual([
      [2, 4],
      [8, 10],
      [20, 22],
      [22, 24],
    ]);
    expect(
      marks(ds)
        .sort((a, b) => a.from - b.from)
        .map((d) => [d.tagName, d.from, d.to]),
    ).toEqual([
      ["mark", 4, 22],
      ["a", 10, 20],
    ]);
  });
  it("reveals the whole Highlight with the cursor inside the link", () => {
    expect(hidden(decorate(doc, 14))).toEqual([]);
  });
  it("reveals the Highlight but keeps the link rendered with the cursor on its text", () => {
    const ds = decorate(doc, 5);
    expect(hidden(ds)).toEqual([
      [8, 10],
      [20, 22],
    ]);
    expect(
      marks(ds)
        .filter((d) => d.tagName)
        .map((d) => [d.tagName, d.from, d.to]),
    ).toEqual([["a", 10, 20]]);
  });
});

describe("block Comment", () => {
  // "before\n\n%%\nA block\n\nsecond\n%%\n\nafter\n": the Comment is 8..29
  const doc = "before\n\n%%\nA block\n\nsecond\n%%\n\nafter\n";
  it("hides every line of a multi-line Comment when the cursor is outside", () => {
    expect(hidden(decorate(doc, 0))).toEqual([[8, 29]]);
  });
  it("reveals the source with the cursor inside", () => {
    expect(hidden(decorate(doc, 14))).toEqual([]);
    expect(hidden(decorate(doc, 8))).toEqual([]);
    expect(hidden(decorate(doc, 29))).toEqual([]);
  });
  it("hides a Comment that opens a Note", () => {
    expect(hidden(decorate("%%\nonly\n%%\n\nnext", 15))).toEqual([[0, 10]]);
  });
  it("hides an unclosed Comment to the end of the Note", () => {
    const text = "a\n\n%%\nnever closed\n\n# Heading";
    expect(hidden(decorate(text, 0))).toEqual([[3, text.length]]);
  });
  it("leaves the Markdown inside a Comment undecorated", () => {
    const text = "%%\n# hidden\n\n**x**\n%%\n\nafter";
    const ds = decorate(text, text.length);
    expect(hidden(ds)).toEqual([[0, 21]]);
    expect(marks(ds)).toEqual([]);
  });
  it("keeps the text after the closing marker", () => {
    expect(hidden(decorate("%%\nx\n%% tail\n\nnext", 18))).toEqual([[0, 7]]);
  });
  it("does not open a Comment inside fenced code", () => {
    expect(decorate("```\n%%\ncode\n%%\n```\n", 0)).toEqual([]);
  });
  it("still hides an inline Comment", () => {
    expect(hidden(decorate("a %%secret%% b", 0))).toEqual([[2, 12]]);
  });
});

describe("inline Footnote", () => {
  it("renders as superscript outside", () => {
    const ds = decorate("a^[note] b", 10);
    expect(hidden(ds)).toEqual([
      [1, 3],
      [7, 8],
    ]);
    expect(marks(ds)).toEqual([
      expect.objectContaining({ from: 3, to: 7, tagName: "sup" }),
    ]);
  });
  it("reveals inside", () => {
    expect(hidden(decorate("a^[note] b", 5))).toEqual([]);
  });
});

describe("Block ID", () => {
  const doc = "Some text ^abc-1\n\nnext";
  it("hides the marker outside", () => {
    expect(hidden(decorate(doc, 20))).toEqual([[10, 16]]);
  });
  it("reveals inside", () => {
    expect(hidden(decorate(doc, 12))).toEqual([]);
  });
  it("finds the marker on headings and list items", () => {
    const text = "# Title ^h1\n\n- item ^li";
    expect(hidden(decorate(text, 14))).toEqual([
      [8, 11],
      [20, 23],
    ]);
  });
  it("ignores a caret inside fenced code", () => {
    expect(decorate("```\ncode ^id\n```\n", 0)).toEqual([]);
  });
});

describe("Save payload", () => {
  it("never changes the document", () => {
    const doc = "a [[N|x]] ==🟡h== %%c%% b^[f] ^id\n";
    const handle = mount(doc, 0);
    expect(handle.view.state.doc.toString()).toBe(doc);
  });
});

describe("raw syntax while the cursor is inside", () => {
  const raw = (doc: string, cursor: number) =>
    decorate(doc, cursor)
      .filter((d) => d.cls)
      .map((d) => [d.cls, d.from, d.to]);

  it("marks a revealed Wiki Link", () => {
    expect(raw("a [[Note]] b", 5)).toEqual([
      ["cm-obsidian-wikilink-raw", 2, 10],
    ]);
  });
  it("marks a revealed Highlight", () => {
    expect(raw("a ==hi== b", 5)).toEqual([["cm-obsidian-highlight-raw", 2, 8]]);
  });
  it("marks a revealed Comment", () => {
    expect(raw("a %%secret%% b", 6)).toEqual([
      ["cm-obsidian-comment-raw", 2, 12],
    ]);
  });
  it("marks a revealed inline Footnote", () => {
    expect(raw("a^[note] b", 5)).toEqual([["cm-obsidian-footnote-raw", 1, 8]]);
  });
  it("marks a revealed Block ID", () => {
    expect(raw("Some text ^abc-1\n\nnext", 12)).toEqual([
      ["cm-obsidian-block-id-raw", 10, 16],
    ]);
  });
  it("marks nothing while the construct renders", () => {
    expect(raw("a [[Note]] ==hi== %%c%% ^[f] b\n\nend", 33)).toEqual([]);
  });
});
