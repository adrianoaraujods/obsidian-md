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
        tagName?: string;
        attributes?: Record<string, string>;
      };
      out.push({
        from,
        to,
        hidden: !spec.tagName,
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
    expect(decorate(doc, 5)).toEqual([]);
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
    expect(decorate("a ==hi== b", 5)).toEqual([]);
  });
});

describe("Comment", () => {
  it("is hidden outside", () => {
    expect(hidden(decorate("a %%secret%% b", 0))).toEqual([[2, 12]]);
  });
  it("reveals inside", () => {
    expect(decorate("a %%secret%% b", 6)).toEqual([]);
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
    expect(decorate("a^[note] b", 5)).toEqual([]);
  });
});

describe("Block ID", () => {
  const doc = "Some text ^abc-1\n\nnext";
  it("hides the marker outside", () => {
    expect(hidden(decorate(doc, 20))).toEqual([[10, 16]]);
  });
  it("reveals inside", () => {
    expect(decorate(doc, 12)).toEqual([]);
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
