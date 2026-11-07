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

const KEY_CODES: Record<string, number> = { b: 66, i: 73, k: 75 };
/** Presses Ctrl+<key>; returns whether the editor left the event unhandled. */
function press(e: EditorHandle, key: string, mods: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    keyCode: KEY_CODES[key] ?? 0,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...mods,
  });
  e.view.contentDOM.dispatchEvent(event);
  return !event.defaultPrevented;
}
const select = (e: EditorHandle, ...ranges: [number, number][]) =>
  e.view.dispatch({
    selection: EditorSelection.create(
      ranges.map(([a, b]) => EditorSelection.range(a, b)),
    ),
  });
const sel = (e: EditorHandle) =>
  e.view.state.selection.ranges.map((r) => [r.anchor, r.head]);

describe("Mod-b", () => {
  it("wraps the selection in ** and keeps the inner text selected", () => {
    const e = mount("say hello now");
    select(e, [4, 9]);
    press(e, "b");
    expect(e.getText()).toBe("say **hello** now");
    expect(sel(e)).toEqual([[6, 11]]);
  });

  it("inserts an empty pair with the cursor in the middle", () => {
    const e = mount("ab");
    select(e, [1, 1]);
    press(e, "b");
    expect(e.getText()).toBe("a****b");
    expect(sel(e)).toEqual([[3, 3]]);
  });

  it("unwraps ** around the selection, then __", () => {
    const e = mount("**hi** __yo__");
    select(e, [2, 4]);
    press(e, "b");
    expect(e.getText()).toBe("hi __yo__");
    select(e, [5, 7]);
    press(e, "b");
    expect(e.getText()).toBe("hi yo");
  });

  it("unwraps when the markers are inside the selection", () => {
    const e = mount("a **hi** b");
    select(e, [2, 8]);
    press(e, "b");
    expect(e.getText()).toBe("a hi b");
    expect(sel(e)).toEqual([[2, 4]]);
  });

  it("unwraps an empty pair", () => {
    const e = mount("a****b");
    select(e, [3, 3]);
    press(e, "b");
    expect(e.getText()).toBe("ab");
  });

  it("leaves italic markers alone and removes only bold from ***x***", () => {
    const e = mount("***x***");
    select(e, [3, 4]);
    press(e, "b");
    expect(e.getText()).toBe("*x*");
  });

  it("toggles each range by its own state", () => {
    const e = mount("**a** b");
    select(e, [2, 3], [6, 7]);
    press(e, "b");
    expect(e.getText()).toBe("a **b**");
    expect(sel(e)).toEqual([
      [0, 1],
      [4, 5],
    ]);
  });
});

describe("Mod-i", () => {
  it("wraps in * and means italic, not select-parent", () => {
    const e = mount("say hello");
    select(e, [4, 9]);
    press(e, "i");
    expect(e.getText()).toBe("say *hello*");
    expect(sel(e)).toEqual([[5, 10]]);
  });

  it("unwraps * and _ alike", () => {
    const e = mount("*a* _b_");
    select(e, [1, 2]);
    press(e, "i");
    select(e, [3, 4]);
    press(e, "i");
    expect(e.getText()).toBe("a b");
  });

  it("does not take the marker of bold for italic", () => {
    const e = mount("**a**");
    select(e, [2, 3]);
    press(e, "i");
    expect(e.getText()).toBe("***a***");
  });

  it("inserts an empty pair", () => {
    const e = mount("");
    press(e, "i");
    expect(e.getText()).toBe("**");
    expect(sel(e)).toEqual([[1, 1]]);
  });
});

describe("Mod-k", () => {
  it("turns the selection into a link with the cursor in the parentheses", () => {
    const e = mount("see docs now");
    select(e, [4, 8]);
    press(e, "k");
    expect(e.getText()).toBe("see [docs]() now");
    expect(sel(e)).toEqual([[11, 11]]);
  });
});

describe("Mod-k and the host page", () => {
  it("does not reach a window keydown listener when handled", () => {
    const seen: string[] = [];
    const listener = (event: KeyboardEvent) => seen.push(event.key);
    window.addEventListener("keydown", listener);
    try {
      const e = mount("x");
      select(e, [0, 1]);
      press(e, "k");
      expect(e.getText()).toBe("[x]()");
      press(e, "b");
      expect(seen).toEqual(["b"]);
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });
});

describe("Mod-k with nothing selected", () => {
  it("inserts []() with the cursor in the brackets", () => {
    const e = mount("ab");
    select(e, [1, 1]);
    press(e, "k");
    expect(e.getText()).toBe("a[]()b");
    expect(sel(e)).toEqual([[2, 2]]);
  });
});

describe("Mod-k with several cursors", () => {
  it("links every range on its own", () => {
    const e = mount("one two");
    select(e, [0, 3], [4, 4]);
    press(e, "k");
    expect(e.getText()).toBe("[one]() []()two");
    expect(sel(e)).toEqual([
      [6, 6],
      [9, 9],
    ]);
  });
});

/** Pastes `text` into the editor; returns whether the editor left it alone. */
function paste(e: EditorHandle, text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => (type === "text/plain" ? text : "") },
  });
  e.view.contentDOM.dispatchEvent(event);
  return !event.defaultPrevented;
}

describe("pasting a URL over a selection", () => {
  it("makes [text](url) and leaves the cursor after it", () => {
    const e = mount("see docs now");
    select(e, [4, 8]);
    expect(paste(e, "https://example.com/a?b=1")).toBe(false);
    expect(e.getText()).toBe("see [docs](https://example.com/a?b=1) now");
    expect(sel(e)).toEqual([[37, 37]]);
  });
});

describe("pasting over a selection, edge cases", () => {
  it("leaves non-URL text and a bare cursor to the browser", () => {
    const e = mount("see docs now");
    select(e, [4, 8]);
    paste(e, "just words");
    expect(e.getText()).toBe("see just words now");
    select(e, [0, 0]);
    paste(e, "https://example.com");
    expect(e.getText()).toBe("https://example.comsee just words now");
  });

  it("links every selected range", () => {
    const e = mount("one two");
    select(e, [0, 3], [4, 7]);
    paste(e, "http://x.io");
    expect(e.getText()).toBe("[one](http://x.io) [two](http://x.io)");
  });

  it("is off with pasteUrlAsLink: false", () => {
    const e = mount("docs", { pasteUrlAsLink: false });
    select(e, [0, 4]);
    paste(e, "https://example.com");
    expect(e.getText()).toBe("https://example.com");
  });

  it("does nothing while composing", () => {
    const e = mount("docs");
    select(e, [0, 4]);
    e.view.contentDOM.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    paste(e, "https://example.com");
    // The browser's plain paste replaces the text; no link is made.
    expect(e.getText()).toBe("https://example.com");
    select(e, [0, 4]);
    press(e, "k");
    expect(e.getText()).toBe("https://example.com");
  });
});

describe("Mod-k rebinding", () => {
  it("can be rebound or disabled through keys.link", () => {
    const rebound = mount("x", { keys: { link: "Mod-j" } });
    select(rebound, [0, 1]);
    press(rebound, "k");
    expect(rebound.getText()).toBe("x");
    press(rebound, "j", { keyCode: 74 });
    expect(rebound.getText()).toBe("[x]()");
    const off = mount("x", { keys: { link: false } });
    select(off, [0, 1]);
    press(off, "k");
    expect(off.getText()).toBe("x");
  });
});

describe("configuration", () => {
  it("rebinds a command by name and frees its default key", () => {
    const e = mount("x", { keys: { bold: "Mod-j" } });
    select(e, [0, 1]);
    press(e, "b");
    expect(e.getText()).toBe("x");
    press(e, "j", { keyCode: 74 });
    expect(e.getText()).toBe("**x**");
  });

  it("disables a command with false and keeps the others", () => {
    const e = mount("x", { keys: { bold: false } });
    select(e, [0, 1]);
    press(e, "b");
    expect(e.getText()).toBe("x");
    press(e, "i");
    expect(e.getText()).toBe("*x*");
  });

  it("accepts every command name and flag", () => {
    const options: EditingShortcutsOptions = {
      keys: {
        bold: "Mod-b",
        italic: "Mod-i",
        link: false,
        indent: false,
        unindent: false,
        toggleTask: false,
      },
      listContinuation: false,
      autoPair: false,
      wikiLinkAutoClose: false,
      pasteUrlAsLink: false,
      selectionWrap: false,
    };
    expect(() => mount("x", options)).not.toThrow();
  });
});

describe("IME composition", () => {
  it("does nothing while composing", () => {
    const e = mount("x");
    select(e, [0, 1]);
    e.view.contentDOM.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    press(e, "b");
    expect(e.getText()).toBe("x");
  });
});
