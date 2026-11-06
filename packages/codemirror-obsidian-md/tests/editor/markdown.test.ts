import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { markdownProvider } from "../../src/editor/providers/markdown.js";
import { decorationsField, obsidianMd } from "../../src/editor/state.js";

interface Deco {
  from: number;
  to: number;
  cls: string;
  hidden: boolean;
  widget: boolean;
}

/** Decorations of `doc` with the cursor at `cursor`. */
function decorate(doc: string, cursor: number): Deco[] {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(cursor),
    extensions: obsidianMd(doc, { providers: [markdownProvider] }),
  });
  const out: Deco[] = [];
  state.field(decorationsField).between(0, doc.length, (from, to, value) => {
    const spec = value.spec as { class?: string; widget?: unknown };
    out.push({
      from,
      to,
      cls: spec.class ?? "",
      hidden: from !== to && !spec.class && !spec.widget,
      widget: !!spec.widget,
    });
  });
  return out;
}
const hidden = (d: Deco[]) =>
  d.filter((x) => x.hidden).map((x) => [x.from, x.to]);
const classes = (d: Deco[]) => d.map((x) => x.cls).filter(Boolean);
const widgets = (d: Deco[]) =>
  d.filter((x) => x.widget).map((x) => [x.from, x.to]);

describe("markdown Live Preview", () => {
  it("heading: styles the line, hides # outside, shows it inside", () => {
    const doc = "# Title\n\nbody";
    const out = decorate(doc, doc.length);
    expect(classes(out).join(" ")).toContain("cm-obsidian-h1");
    expect(hidden(out)).toEqual([[0, 2]]);
    const inside = decorate(doc, 3);
    expect(classes(inside).join(" ")).toContain("cm-obsidian-h1");
    expect(hidden(inside)).toEqual([]);
  });

  it("heading: dims the # markers only while the cursor is on the line", () => {
    const doc = "## Title\n\nbody";
    const marker = (d: Deco[]) =>
      d
        .filter((x) => x.cls === "cm-obsidian-heading-mark")
        .map((x) => [x.from, x.to]);
    expect(marker(decorate(doc, 4))).toEqual([[0, 3]]);
    expect(marker(decorate(doc, doc.length))).toEqual([]);
  });

  it("strong: hides ** outside, shows inside", () => {
    const doc = "a **bold** b";
    const out = decorate(doc, 0);
    expect(classes(out)).toContain("cm-obsidian-strong");
    expect(hidden(out)).toEqual([
      [2, 4],
      [8, 10],
    ]);
    expect(hidden(decorate(doc, 5))).toEqual([]);
    expect(classes(decorate(doc, 5))).toContain("cm-obsidian-strong");
  });

  it("emphasis: hides * or _ outside, shows inside", () => {
    const doc = "a *it* and _it_ b";
    const out = decorate(doc, doc.length);
    expect(classes(out).filter((c) => c === "cm-obsidian-em")).toHaveLength(2);
    expect(hidden(out)).toEqual([
      [2, 3],
      [5, 6],
      [11, 12],
      [14, 15],
    ]);
    expect(hidden(decorate(doc, 3))).toEqual([
      [11, 12],
      [14, 15],
    ]);
  });

  it("inline code: hides backticks outside, shows inside", () => {
    const doc = "x `code` y";
    const out = decorate(doc, 0);
    expect(classes(out)).toContain("cm-obsidian-code");
    expect(hidden(out)).toEqual([
      [2, 3],
      [7, 8],
    ]);
    expect(hidden(decorate(doc, 5))).toEqual([]);
  });

  it("bullet list: renders a bullet outside, raw marker inside", () => {
    const doc = "- one\n- two";
    const out = decorate(doc, doc.length);
    expect(widgets(out)).toEqual([[0, 1]]);
    expect(classes(out)).toContain("cm-obsidian-li");
    expect(widgets(decorate(doc, 2))).toEqual([[6, 7]]);
  });

  it("ordered list: styles the item, keeps the number", () => {
    const doc = "1. one\n\nend";
    const out = decorate(doc, doc.length);
    expect(classes(out)).toContain("cm-obsidian-li");
    expect(out.filter((d) => d.widget || d.hidden)).toEqual([]);
  });

  it("task list: checkbox outside, raw [ ] inside; checked is styled", () => {
    const doc = "- [ ] todo\n- [x] done\n\nend";
    const out = decorate(doc, doc.length);
    expect(widgets(out)).toEqual([
      [0, 6],
      [11, 17],
    ]);
    expect(classes(out)).toContain("cm-obsidian-task-done");
    expect(widgets(decorate(doc, 3)).map((w) => w[0])).toEqual([11]);
  });

  it("quote: styles lines, hides > outside, shows inside", () => {
    const doc = "> a\n> b\n\nend";
    const out = decorate(doc, doc.length);
    expect(classes(out).filter((c) => c === "cm-obsidian-quote")).toHaveLength(
      2,
    );
    expect(hidden(out)).toEqual([
      [0, 2],
      [4, 6],
    ]);
    const inside = decorate(doc, 5);
    expect(hidden(inside)).toEqual([]);
    expect(classes(inside)).toContain("cm-obsidian-quote");
  });

  it("nested quote hides each marker once", () => {
    const doc = "> a\n> > b\n\nend";
    expect(hidden(decorate(doc, doc.length))).toEqual([
      [0, 2],
      [4, 8],
    ]);
  });

  it("never changes the document", () => {
    const doc = "# T\n**b** *i* `c`\n- [ ] t\n> q";
    const state = EditorState.create({
      doc,
      extensions: obsidianMd(doc, { providers: [markdownProvider] }),
    });
    expect(state.doc.toString()).toBe(doc);
  });
});

describe("emphasis inside a Highlight", () => {
  // ==**bold** and *it*==
  it("hides each marker at its own position", () => {
    const doc = "==**bold** and *it*==";
    expect(
      hidden(decorate(doc, doc.length + 0)).sort((a, b) => a[0]! - b[0]!),
    ).toEqual([
      [2, 4],
      [8, 10],
      [15, 16],
      [18, 19],
    ]);
  });
});
