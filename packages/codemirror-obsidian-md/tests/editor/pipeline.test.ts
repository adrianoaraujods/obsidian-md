// @vitest-environment jsdom
import { Decoration } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ConstructProvider,
  createEditor,
  createNoteParser,
  type EditorHandle,
  isRevealed,
} from "../../src/editor/index.js";
import { decorationsField } from "../../src/editor/state.js";

const handles: EditorHandle[] = [];
function mount(doc: string, options: Record<string, unknown> = {}) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const handle = createEditor({ parent, doc, ...options });
  handles.push(handle);
  return handle;
}
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
  vi.useRealTimers();
});

function types(text: string) {
  return createNoteParser()(text).map((c) => c.type);
}
function slice(text: string, type: string) {
  return createNoteParser()(text)
    .filter((c) => c.type === type)
    .map((c) => text.slice(c.from, c.to));
}

describe("parser", () => {
  it("finds Obsidian constructs at source positions, Comments included", () => {
    const text = "a [[Note|x]] ![[img.png]] ==hi== %%c%% b^[fn]\n";
    expect(slice(text, "wikiLink")).toEqual(["[[Note|x]]"]);
    expect(slice(text, "embed")).toEqual(["![[img.png]]"]);
    expect(slice(text, "obsidianHighlight")).toEqual(["==hi=="]);
    expect(slice(text, "obsidianComment")).toEqual(["%%c%%"]);
    expect(slice(text, "obsidianFootnote")).toEqual(["^[fn]"]);
  });

  it("offsets positions past Frontmatter and never parses it", () => {
    const text = "---\ntitle: [[X]]\n---\n[[A]]";
    expect(slice(text, "wikiLink")).toEqual(["[[A]]"]);
    expect(types(text)).not.toContain("thematicBreak");
  });

  it("shows tables, fenced code, math and reference footnotes as plain source", () => {
    const text = [
      "| a | [[T]] |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "```mermaid",
      "graph [[C]]",
      "```",
      "",
      "$$",
      "x [[M]]",
      "$$",
      "",
      "ref[^1]",
      "",
      "[^1]: note [[F]]",
      "",
    ].join("\n");
    const found = types(text);
    for (const plain of [
      "table",
      "code",
      "math",
      "footnoteDefinition",
      "footnoteReference",
      "wikiLink",
    ]) {
      expect(found).not.toContain(plain);
    }
  });

  it.each([
    ["<br>"],
    ["<!-- c -->"],
    ["a < b"],
    ["<https://example.com>"],
    ["x\r\ny\r\n"],
    ["no trailing newline"],
    ["---\nunclosed: frontmatter"],
    ["---\n: : [odd\n---\nbody"],
    [""],
  ])("parses %j without throwing", (text) => {
    expect(() => createNoteParser()(text)).not.toThrow();
  });
});

describe("providers and cursor reveal", () => {
  const marker = Decoration.mark({ class: "wl" });
  const provider: ConstructProvider = {
    name: "test",
    types: ["wikiLink"],
    decorate: (c, ctx) => (ctx.revealed ? null : marker.range(c.from, c.to)),
  };
  function decorated(editor: EditorHandle) {
    const out: [number, number][] = [];
    editor.view.state
      .field(decorationsField)
      .between(0, editor.view.state.doc.length, (from, to) => {
        out.push([from, to]);
      });
    return out;
  }

  it("decorates a construct when the cursor is outside and reveals it when inside", () => {
    const editor = mount("hi [[A]] there", { providers: [provider] });
    editor.view.dispatch({ selection: { anchor: 0 } });
    expect(decorated(editor)).toEqual([[3, 8]]);
    editor.view.dispatch({ selection: { anchor: 5 } });
    expect(decorated(editor)).toEqual([]);
    editor.view.dispatch({ selection: { anchor: 13 } });
    expect(decorated(editor)).toEqual([[3, 8]]);
  });

  it("maps decorations through edits until the debounced re-parse", () => {
    vi.useFakeTimers();
    const editor = mount("hi [[A]]", { providers: [provider], idleMs: 100 });
    editor.view.dispatch({ selection: { anchor: 0 } });
    editor.view.dispatch({
      changes: { from: 0, insert: "XX" },
      selection: { anchor: 0 },
    });
    expect(decorated(editor)).toEqual([[5, 10]]);
    vi.advanceTimersByTime(100);
    expect(decorated(editor)).toEqual([[5, 10]]);
  });

  it("re-parses once at idle, not on every keystroke", () => {
    vi.useFakeTimers();
    const parser = vi.fn(() => []);
    const editor = mount("a", { parser, idleMs: 100 });
    expect(parser).toHaveBeenCalledTimes(1); // initial
    for (let i = 0; i < 5; i++) {
      editor.view.dispatch({ changes: { from: 0, insert: "x" } });
      vi.advanceTimersByTime(50);
    }
    expect(parser).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(parser).toHaveBeenCalledTimes(2);
    expect(parser).toHaveBeenLastCalledWith("xxxxxa");
  });

  it("picks up new constructs after the idle re-parse", () => {
    vi.useFakeTimers();
    const editor = mount("hi ", { providers: [provider], idleMs: 100 });
    editor.view.dispatch({ changes: { from: 3, insert: "[[B]]" } });
    editor.view.dispatch({ selection: { anchor: 0 } });
    expect(decorated(editor)).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(decorated(editor)).toEqual([[3, 8]]);
  });

  it("exposes the reveal helper", () => {
    const editor = mount("hello world");
    editor.view.dispatch({ selection: { anchor: 3 } });
    expect(isRevealed(editor.view.state, 0, 5)).toBe(true);
    expect(isRevealed(editor.view.state, 6, 11)).toBe(false);
  });
});

describe("large Notes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("does not re-parse while typing on a large Note", () => {
    const big = "# T\n\nsome [[Link]] and ==mark== text\n\n".repeat(5000);
    const parser = vi.fn(createNoteParser());
    const editor = mount(big, { parser });
    parser.mockClear();
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      editor.view.dispatch({ changes: { from: 10, insert: "x" } });
    }
    expect(parser).not.toHaveBeenCalled();
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("CRLF", () => {
  it("inserts CRLF on Enter in a CRLF Note", () => {
    const editor = mount("a\r\nb");
    editor.view.dispatch({ selection: { anchor: 1 } });
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    editor.view.contentDOM.dispatchEvent(event);
    expect(editor.getText()).toBe("a\r\n\r\nb");
  });
});
