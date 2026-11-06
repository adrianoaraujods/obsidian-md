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

/** Presses a plain key; returns whether the editor handled it. */
function press(e: EditorHandle, key: string) {
  const event = new KeyboardEvent("keydown", {
    key,
    keyCode: key === "Enter" ? 13 : 8,
    bubbles: true,
    cancelable: true,
  });
  e.view.contentDOM.dispatchEvent(event);
  return event.defaultPrevented;
}
const select = (e: EditorHandle, ...ranges: [number, number][]) =>
  e.view.dispatch({
    selection: EditorSelection.create(
      ranges.map(([a, b]) => EditorSelection.range(a, b)),
    ),
  });
const sel = (e: EditorHandle) =>
  e.view.state.selection.ranges.map((r) => [r.anchor, r.head]);
const enter = (doc: string, at = doc.length) => {
  const e = mount(doc);
  select(e, [at, at]);
  press(e, "Enter");
  return e;
};

describe("Enter on a list item", () => {
  it.each(["-", "*", "+"])("continues a %s bullet", (m) => {
    const e = enter(`${m} one`);
    expect(e.getText()).toBe(`${m} one\n${m} `);
    expect(sel(e)).toEqual([[e.getText().length, e.getText().length]]);
  });

  it("increments a numbered item, keeping its delimiter", () => {
    expect(enter("1. one").getText()).toBe("1. one\n2. ");
    expect(enter("9) nine").getText()).toBe("9) nine\n10) ");
  });

  it("continues a task item unchecked", () => {
    expect(enter("- [x] done").getText()).toBe("- [x] done\n- [ ] ");
    expect(enter("1. [ ] todo").getText()).toBe("1. [ ] todo\n2. [ ] ");
  });

  it("continues a blockquote and a Callout body", () => {
    expect(enter("> quoted").getText()).toBe("> quoted\n> ");
    expect(enter("> > nested").getText()).toBe("> > nested\n> > ");
    expect(enter("> [!note] Title\n> body", 22).getText()).toBe(
      "> [!note] Title\n> body\n> ",
    );
  });

  it("keeps the indentation", () => {
    expect(enter("  - sub").getText()).toBe("  - sub\n  - ");
    expect(enter("\t2. sub").getText()).toBe("\t2. sub\n\t3. ");
  });

  it("leaves a plain line to the default Enter", () => {
    expect(enter("plain").getText()).toBe("plain\n");
  });

  it("splits an item in the middle and carries the marker", () => {
    const e = enter("- onetwo", 5);
    expect(e.getText()).toBe("- one\n- two");
    expect(sel(e)).toEqual([[8, 8]]);
    expect(enter("3. onetwo", 6).getText()).toBe("3. one\n4. two");
  });

  it("does not continue with the cursor inside the marker", () => {
    expect(enter("- one", 1).getText()).toBe("-\none");
  });

  it("ends the list on an empty item", () => {
    const e = enter("- one\n- ");
    expect(e.getText()).toBe("- one\n");
    expect(sel(e)).toEqual([[6, 6]]);
    expect(enter("1. a\n  2. [ ] ").getText()).toBe("1. a\n");
    expect(enter("> a\n> ").getText()).toBe("> a\n");
  });
});

describe("Backspace on an empty marker", () => {
  const backspace = (doc: string, at = doc.length) => {
    const e = mount(doc);
    select(e, [at, at]);
    press(e, "Backspace");
    return e;
  };

  it("removes the marker", () => {
    const e = backspace("- one\n  1. [ ] ");
    expect(e.getText()).toBe("- one\n");
    expect(sel(e)).toEqual([[6, 6]]);
    expect(backspace("> a\n> ").getText()).toBe("> a\n");
  });

  it("deletes a character as usual on a non-empty item", () => {
    expect(backspace("- one").getText()).toBe("- on");
  });
});

describe("fenced code", () => {
  it.each(["```", "~~~"])("does nothing inside a %s fence", (f) => {
    const doc = `${f}\n- not a list\n${f}`;
    const e = mount(doc);
    select(e, [f.length + 13, f.length + 13]);
    press(e, "Enter");
    expect(e.getText()).toBe(`${f}\n- not a list\n\n${f}`);
    const empty = enter(`${f}js\n- `);
    expect(empty.getText()).toBe(`${f}js\n- \n`);
  });

  it("continues again after the fence closes", () => {
    expect(enter("```\nx\n```\n- a").getText()).toBe("```\nx\n```\n- a\n- ");
    expect(enter("````\n```\n- a").getText()).toBe("````\n```\n- a\n");
  });

  it("treats a %% Comment as ordinary text", () => {
    expect(enter("%%\n- a\n%%\n- b", 6).getText()).toBe("%%\n- a\n- \n%%\n- b");
  });
});

describe("options and environment", () => {
  it("continues per range with several cursors", () => {
    const e = mount("- a\n1. b\nplain\n```\n- c");
    select(e, [3, 3], [8, 8], [14, 14], [22, 22]);
    press(e, "Enter");
    expect(e.getText()).toBe("- a\n- \n1. b\n2. \nplain\n\n```\n- c\n");
    expect(sel(e).map(([a]) => a)).toEqual([6, 15, 22, 31]);
  });

  it("removes every empty marker on Backspace with several cursors", () => {
    const e = mount("- \nx\n1. ");
    select(e, [2, 2], [8, 8]);
    press(e, "Backspace");
    expect(e.getText()).toBe("\nx\n");
  });

  it("is off when listContinuation is false", () => {
    const e = mount("- a", { listContinuation: false });
    select(e, [3, 3]);
    press(e, "Enter");
    expect(e.getText()).toBe("- a\n");
  });

  it("does nothing while composing", () => {
    const e = mount("- a");
    select(e, [3, 3]);
    e.view.contentDOM.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    press(e, "Enter");
    expect(e.getText()).toBe("- a\n");
  });

  it("keeps a CRLF Note consistent", () => {
    expect(enter("- a\r\n- b", 8).getText()).toBe("- a\r\n- b\r\n- ");
    expect(enter("- a\r\n- bc\r\n", 8).getText()).toBe("- a\r\n- b\r\n- c\r\n");
    expect(enter("- a\r\n- b\r\n- ", 12).getText()).toBe("- a\r\n- b\r\n");
    expect(enter("- a\r\n- b", 4).getText()).toBe("- a\r\n- \r\n- b");
  });
});
