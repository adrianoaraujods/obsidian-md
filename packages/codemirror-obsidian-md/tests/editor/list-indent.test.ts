// @vitest-environment jsdom
import { EditorSelection } from "@codemirror/state";
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

const CODES: Record<string, number> = { Tab: 9, "]": 221, "[": 219, Enter: 13 };
/** Presses a key; returns whether the editor handled it. */
function press(e: EditorHandle, key: string, mods: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    keyCode: CODES[key] ?? 0,
    bubbles: true,
    cancelable: true,
    ...mods,
  });
  e.view.contentDOM.dispatchEvent(event);
  return event.defaultPrevented;
}
const tab = (e: EditorHandle) => press(e, "Tab");
const shiftTab = (e: EditorHandle) => press(e, "Tab", { shiftKey: true });
const select = (e: EditorHandle, ...ranges: [number, number][]) =>
  e.view.dispatch({
    selection: EditorSelection.create(
      ranges.map(([a, b]) => EditorSelection.range(a, b)),
    ),
  });
const sel = (e: EditorHandle) =>
  e.view.state.selection.ranges.map((r) => [r.anchor, r.head]);

describe("Tab on a list item", () => {
  it("indents a bullet by one level and keeps the cursor on its text", () => {
    const e = mount("- one\n- two");
    select(e, [8, 8]);
    expect(tab(e)).toBe(true);
    expect(e.getText()).toBe("- one\n\t- two");
    expect(sel(e)).toEqual([[9, 9]]);
  });
});

describe("Tab where there is no list", () => {
  it("is not intercepted on a plain line", () => {
    const e = mount("plain");
    select(e, [2, 2]);
    expect(tab(e)).toBe(false);
    expect(shiftTab(e)).toBe(false);
    expect(e.getText()).toBe("plain");
  });

  it("is not intercepted inside fenced code", () => {
    const e = mount("```\n- one\n```");
    select(e, [6, 6]);
    expect(tab(e)).toBe(false);
    expect(e.getText()).toBe("```\n- one\n```");
  });
});

describe("Shift-Tab on a list item", () => {
  it("removes one level of indent from a tab-indented item", () => {
    const e = mount("- one\n\t\t- two");
    select(e, [11, 11]);
    expect(shiftTab(e)).toBe(true);
    expect(e.getText()).toBe("- one\n\t- two");
    expect(sel(e)).toEqual([[10, 10]]);
  });

  it("removes up to four spaces and is handled at the top level", () => {
    const e = mount("- one\n      - two");
    select(e, [14, 14]);
    shiftTab(e);
    expect(e.getText()).toBe("- one\n  - two");
    const top = mount("- one");
    expect(shiftTab(top)).toBe(true);
    expect(top.getText()).toBe("- one");
  });
});

describe("renumbering", () => {
  it("restarts an indented item and closes the gap it leaves", () => {
    const e = mount("1. a\n2. b\n3. c");
    select(e, [7, 7]);
    tab(e);
    expect(e.getText()).toBe("1. a\n\t1. b\n2. c");
  });
});

describe("renumbering on unindent and across lines", () => {
  it("joins the parent level and renumbers what follows at both", () => {
    const e = mount("1. a\n2. b\n\t1. c\n\t2. d\n3. e");
    select(e, [15, 15]);
    shiftTab(e);
    expect(e.getText()).toBe("1. a\n2. b\n3. c\n\t2. d\n4. e");
  });

  it("indents every selected item and counts them from 1", () => {
    const e = mount("1. a\n2. b\n3. c\n4. d");
    select(e, [6, 13]);
    tab(e);
    expect(e.getText()).toBe("1. a\n\t1. b\n\t2. c\n2. d");
  });

  it("indents a task and a quote item", () => {
    const e = mount("- [ ] a\n> b");
    select(e, [0, 11]);
    tab(e);
    expect(e.getText()).toBe("\t- [ ] a\n\t> b");
  });

  it("works at every cursor", () => {
    const e = mount("- a\n- b\nplain\n- c");
    select(e, [3, 3], [9, 9], [16, 16]);
    tab(e);
    expect(e.getText()).toBe("\t- a\n- b\nplain\n\t- c");
  });
});

const mod = { ctrlKey: true };
describe("Mod-] and Mod-[", () => {
  it("indent and unindent the current line, list or not", () => {
    const e = mount("plain");
    select(e, [2, 2]);
    expect(press(e, "]", mod)).toBe(true);
    expect(e.getText()).toBe("\tplain");
    expect(sel(e)).toEqual([[3, 3]]);
    expect(press(e, "[", mod)).toBe(true);
    expect(e.getText()).toBe("plain");
  });

  it("act on every selected line and renumber", () => {
    const e = mount("1. a\n2. b\nx\n3. c");
    select(e, [0, 8]);
    press(e, "]", mod);
    expect(e.getText()).toBe("\t1. a\n\t2. b\nx\n3. c");
    press(e, "[", mod);
    expect(e.getText()).toBe("1. a\n2. b\nx\n3. c");
  });

  it("work inside fenced code and per cursor", () => {
    const e = mount("```\na\nb\n```");
    select(e, [4, 4], [6, 6]);
    press(e, "]", mod);
    expect(e.getText()).toBe("```\n\ta\n\tb\n```");
  });

  it("can be rebound or disabled", () => {
    const moved = mount("x", { keys: { indent: "Mod-j" } });
    press(moved, "]", mod);
    expect(moved.getText()).not.toContain("\t");
    const fresh = mount("x", { keys: { indent: "Mod-j" } });
    press(fresh, "j", { ...mod, keyCode: 74 });
    expect(fresh.getText()).toBe("\tx");
    const off = mount("x", { keys: { indent: false } });
    select(off, [0, 0]);
    press(off, "]", mod);
    expect(off.getText()).not.toBe("\tx");
  });
});

describe("Mod-Enter", () => {
  const toggle = (doc: string, at = 0) => {
    const e = mount(doc);
    select(e, [at, at]);
    press(e, "Enter", mod);
    return e;
  };

  it("toggles a task between unchecked and checked", () => {
    expect(toggle("- [ ] a").getText()).toBe("- [x] a");
    expect(toggle("1. [x] a").getText()).toBe("1. [ ] a");
  });

  it("turns a plain list item into an unchecked task", () => {
    const e = toggle("- a", 3);
    expect(e.getText()).toBe("- [ ] a");
    expect(sel(e)).toEqual([[7, 7]]);
    expect(toggle("2. a").getText()).toBe("2. [ ] a");
  });

  it("does nothing on a non-list line, and is handled", () => {
    const e = mount("plain");
    expect(press(e, "Enter", mod)).toBe(true);
    expect(e.getText()).toBe("plain");
  });

  it("toggles each cursor's own item", () => {
    const e = mount("- [ ] a\n- [x] b\n- c");
    select(e, [3, 3], [11, 11], [19, 19]);
    press(e, "Enter", mod);
    expect(e.getText()).toBe("- [x] a\n- [ ] b\n- [ ] c");
  });

  it("is skipped while composing", () => {
    const e = mount("- [ ] a");
    e.view.contentDOM.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    press(e, "Enter", mod);
    expect(e.getText()).toBe("- [ ] a");
  });
});

describe("Tab and Shift-Tab gating", () => {
  it("are off with listContinuation: false", () => {
    const e = mount("- a", { listContinuation: false });
    expect(tab(e)).toBe(false);
    expect(e.getText()).toBe("- a");
  });

  it("are skipped while composing", () => {
    const e = mount("- a");
    e.view.contentDOM.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    expect(tab(e)).toBe(false);
    expect(e.getText()).toBe("- a");
  });
});
