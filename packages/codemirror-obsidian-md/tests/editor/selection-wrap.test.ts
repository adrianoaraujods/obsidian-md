// @vitest-environment jsdom
import { undo } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import {
  createEditor,
  type EditingShortcutsOptions,
  type EditorHandle,
  editingShortcuts,
} from "../../src/editor/index.js";

const handles: EditorHandle[] = [];
function mount(doc: string, options?: EditingShortcutsOptions) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const handle = createEditor({
    parent,
    doc,
    extensions: [editingShortcuts(options)],
  });
  handles.push(handle);
  return handle;
}
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
});

const select = (e: EditorHandle, ...ranges: [number, number][]) =>
  e.view.dispatch({
    selection: EditorSelection.create(
      ranges.map(([a, b]) => EditorSelection.range(a, b)),
    ),
  });
const sel = (e: EditorHandle) =>
  e.view.state.selection.ranges.map((r) => [r.anchor, r.head]);

/**
 * Types `text` over the main selection the way CodeMirror receives input.
 * jsdom has no real keyboard events, so typing is simulated through the
 * `EditorView.inputHandler` facet: the handlers get first refusal, else the
 * text replaces the range.
 */
function type(e: EditorHandle, text: string) {
  const { view } = e;
  const { from, to } = view.state.selection.main;
  const handled = view.state.facet(EditorView.inputHandler).some((h) =>
    h(view, from, to, text, () =>
      view.state.update({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
        userEvent: "input.type",
      }),
    ),
  );
  if (!handled) {
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      userEvent: "input.type",
    });
  }
}

describe("Selection Wrap", () => {
  it("wraps the selection in the typed character and keeps it selected", () => {
    const e = mount("say hello now");
    select(e, [4, 9]);
    type(e, "*");
    expect(e.getText()).toBe("say *hello* now");
    expect(sel(e)).toEqual([[5, 10]]);
  });

  it.each([
    ["_", "_x_"],
    ["`", "`x`"],
    ["~", "~x~"],
    ["=", "=x="],
    ["[", "[x]"],
    ["(", "(x)"],
    ["{", "{x}"],
    ['"', '"x"'],
    ["'", "'x'"],
  ])("wraps in %s", (ch, wrapped) => {
    const e = mount("x");
    select(e, [0, 1]);
    type(e, ch);
    expect(e.getText()).toBe(wrapped);
    expect(sel(e)).toEqual([[1, 2]]);
  });

  it("nests on a repeat of the same key", () => {
    const e = mount("x");
    select(e, [0, 1]);
    type(e, "*");
    type(e, "*");
    expect(e.getText()).toBe("**x**");
    expect(sel(e)).toEqual([[2, 3]]);
  });

  it("makes each wrap its own undo step", () => {
    const e = mount("x");
    select(e, [0, 1]);
    type(e, "*");
    type(e, "*");
    undo(e.view);
    expect(e.getText()).toBe("*x*");
    undo(e.view);
    expect(e.getText()).toBe("x");
  });

  it("wraps every range", () => {
    const e = mount("ab cd");
    select(e, [0, 2], [3, 5]);
    type(e, "*");
    expect(e.getText()).toBe("*ab* *cd*");
    expect(sel(e)).toEqual([
      [1, 3],
      [6, 8],
    ]);
  });

  it("keeps a backwards selection backwards", () => {
    const e = mount("ab");
    select(e, [2, 0]);
    type(e, "*");
    expect(e.getText()).toBe("*ab*");
    expect(sel(e)).toEqual([[3, 1]]);
  });

  it("leaves an empty selection to the default input", () => {
    const e = mount("ab");
    select(e, [1, 1]);
    type(e, "*");
    expect(e.getText()).toBe("a*b");
  });

  it("replaces the selection with other characters", () => {
    const e = mount("ab");
    select(e, [0, 2]);
    type(e, "z");
    expect(e.getText()).toBe("z");
  });

  it("is off when selectionWrap is false", () => {
    const e = mount("ab", { selectionWrap: false });
    select(e, [0, 2]);
    type(e, "*");
    expect(e.getText()).toBe("*");
  });

  it("is skipped while composing", () => {
    const e = mount("ab");
    select(e, [0, 2]);
    Object.defineProperty(e.view, "composing", { value: true });
    type(e, "*");
    expect(e.getText()).toBe("*");
  });
});

describe("Selection Wrap with a mix of ranges", () => {
  it("wraps the selected range and pairs the empty one in one keystroke", () => {
    const e = mount("ab cd");
    select(e, [0, 2], [3, 3]);
    type(e, "(");
    expect(e.getText()).toBe("(ab) ()cd");
    expect(sel(e)).toEqual([
      [1, 3],
      [6, 6],
    ]);
  });

  it("wraps the selected range when the empty one is first", () => {
    const e = mount("ab cd");
    select(e, [0, 0], [3, 5]);
    type(e, "[");
    expect(e.getText()).toBe("[]ab [cd]");
    expect(sel(e)).toEqual([
      [1, 1],
      [6, 8],
    ]);
  });

  it("inserts a marker plainly at the empty range", () => {
    const e = mount("ab cd");
    select(e, [0, 2], [3, 3]);
    type(e, "*");
    expect(e.getText()).toBe("*ab* *cd");
    expect(sel(e)).toEqual([
      [1, 3],
      [6, 6],
    ]);
  });
});
