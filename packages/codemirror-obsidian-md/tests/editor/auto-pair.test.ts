// @vitest-environment jsdom
import { completionStatus } from "@codemirror/autocomplete";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import {
  createEditor,
  type EditingShortcutsOptions,
  type EditorHandle,
  editingShortcuts,
  pickerExtension,
} from "../../src/editor/index.js";

// jsdom has no layout; CodeMirror's frame-time measuring needs these rects.
const emptyRects = () => [] as unknown as DOMRectList;
Range.prototype.getClientRects ??= emptyRects;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const handles: EditorHandle[] = [];
function mount(doc: string, options?: EditingShortcutsOptions) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const handle = createEditor({
    parent,
    doc,
    extensions: [
      editingShortcuts(options),
      pickerExtension({ candidates: [{ path: "Roadmap.md" }] }),
    ],
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
const tick = () => new Promise((r) => setTimeout(r, 80));

/**
 * Types `text` at the main selection as CodeMirror receives input. jsdom has
 * no real keyboard events, so typing is simulated through the
 * `EditorView.inputHandler` facet.
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

/** Presses a key; returns whether the editor left the event unhandled. */
function press(e: EditorHandle, key: string, mods: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    keyCode: { Backspace: 8, Escape: 27, " ": 32 }[key] ?? 0,
    bubbles: true,
    cancelable: true,
    ...mods,
  });
  e.view.contentDOM.dispatchEvent(event);
  return !event.defaultPrevented;
}

describe("Auto-pair", () => {
  it("inserts the closer too, with the cursor between", () => {
    const e = mount("");
    type(e, "(");
    expect(e.getText()).toBe("()");
    expect(sel(e)).toEqual([[1, 1]]);
  });

  it("steps over a typed closer that is already next", () => {
    const e = mount("");
    type(e, "(");
    type(e, ")");
    expect(e.getText()).toBe("()");
    expect(sel(e)).toEqual([[2, 2]]);
  });

  it("deletes both characters of an empty pair on Backspace", () => {
    const e = mount("a()b");
    select(e, [2, 2]);
    expect(press(e, "Backspace")).toBe(false);
    expect(e.getText()).toBe("ab");
    expect(sel(e)).toEqual([[1, 1]]);
  });

  it("does not pair quotes after a word character", () => {
    const e = mount("don");
    select(e, [3, 3]);
    type(e, "'");
    expect(e.getText()).toBe("don'");
    const f = mount("say ");
    select(f, [4, 4]);
    type(f, "'");
    expect(f.getText()).toBe("say ''");
  });

  it("types a closing quote after a word normally, stepping over a pair's", () => {
    const e = mount("");
    type(e, '"');
    type(e, "hi");
    type(e, '"');
    expect(e.getText()).toBe('"hi"');
    expect(sel(e)).toEqual([[4, 4]]);
    const f = mount('"hi');
    select(f, [3, 3]);
    type(f, '"');
    expect(f.getText()).toBe('"hi"');
  });

  it("never pairs the markers * _ ~ =", () => {
    for (const marker of ["*", "_", "~", "="]) {
      const e = mount("");
      type(e, marker);
      expect(e.getText()).toBe(marker);
    }
  });

  it("pairs every opener", () => {
    for (const [open, pair] of [
      ["[", "[]"],
      ["{", "{}"],
      ['"', '""'],
      ["`", "``"],
    ] as const) {
      const e = mount("");
      type(e, open);
      expect(e.getText()).toBe(pair);
      expect(sel(e)).toEqual([[1, 1]]);
    }
  });

  it("gives [[]] with the cursor inside and the picker open", async () => {
    const e = mount("");
    type(e, "[");
    type(e, "[");
    await tick();
    expect(e.getText()).toBe("[[]]");
    expect(sel(e)).toEqual([[2, 2]]);
    expect(completionStatus(e.view.state)).toBe("active");
  });

  it("wikiLinkAutoClose: false never leaves an unbalanced [[", () => {
    const e = mount("", { wikiLinkAutoClose: false });
    type(e, "[");
    type(e, "[");
    expect(e.getText()).toBe("[[]]");
    expect(sel(e)).toEqual([[2, 2]]);
    const f = mount("", { wikiLinkAutoClose: false });
    type(f, "(");
    expect(f.getText()).toBe("()");
  });

  it("autoPair: false keeps the [[ close on its own", () => {
    const e = mount("", { autoPair: false });
    type(e, "[");
    expect(e.getText()).toBe("[");
    type(e, "[");
    expect(e.getText()).toBe("[[]]");
    expect(sel(e)).toEqual([[2, 2]]);
    type(e, "x");
    type(e, "]");
    type(e, "]");
    expect(e.getText()).toBe("[[x]]");
    expect(sel(e)).toEqual([[5, 5]]);
  });

  it("autoPair: false and wikiLinkAutoClose: false type brackets plainly", () => {
    const e = mount("", { autoPair: false, wikiLinkAutoClose: false });
    type(e, "[");
    type(e, "[");
    type(e, "(");
    expect(e.getText()).toBe("[[(");
  });

  it("autoPair: false turns pairing and the Backspace pair-delete off", () => {
    const e = mount("", { autoPair: false });
    type(e, "(");
    type(e, "[");
    expect(e.getText()).toBe("([");
    const f = mount("a()b", { autoPair: false });
    select(f, [2, 2]);
    press(f, "Backspace");
    expect(f.getText()).toBe("a)b");
  });

  it("is skipped while composing", () => {
    const e = mount("");
    Object.defineProperty(e.view, "composing", { value: true });
    type(e, "(");
    expect(e.getText()).toBe("(");
  });

  it("pairs at every cursor and keeps the picker closed", async () => {
    const e = mount("a\nb");
    select(e, [1, 1], [3, 3]);
    type(e, "[");
    type(e, "[");
    await tick();
    expect(e.getText()).toBe("a[[]]\nb[[]]");
    expect(sel(e)).toEqual([
      [3, 3],
      [9, 9],
    ]);
    expect(completionStatus(e.view.state)).toBeNull();
  });

  it("steps over and pair-deletes at every cursor", () => {
    const e = mount("()\n()");
    select(e, [1, 1], [4, 4]);
    press(e, "Backspace");
    expect(e.getText()).toBe("\n");
    const f = mount("()\n()");
    select(f, [1, 1], [4, 4]);
    type(f, ")");
    expect(sel(f)).toEqual([
      [2, 2],
      [5, 5],
    ]);
  });

  it("Ctrl-Space inside [[…]] reopens the picker after it was dismissed", async () => {
    const e = mount("");
    type(e, "[");
    type(e, "[");
    await tick();
    expect(completionStatus(e.view.state)).toBe("active");
    press(e, "Escape");
    expect(completionStatus(e.view.state)).toBeNull();
    press(e, " ", { ctrlKey: true });
    await tick();
    expect(completionStatus(e.view.state)).toBe("active");
  });
});
