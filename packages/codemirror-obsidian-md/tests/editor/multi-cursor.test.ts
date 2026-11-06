// @vitest-environment jsdom
import { completionStatus } from "@codemirror/autocomplete";
import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import {
  createEditor,
  type EditorHandle,
  inlineProviders,
  pickerExtension,
} from "../../src/editor/index.js";
import { decorationsField } from "../../src/editor/state.js";

const handles: EditorHandle[] = [];
function mount(doc: string) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const handle = createEditor({ parent, doc });
  handles.push(handle);
  return handle;
}
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
});

const cursors = (e: EditorHandle) =>
  e.view.state.selection.ranges.map((r) => [r.anchor, r.head]);

function press(e: EditorHandle, key: string, mods: Partial<KeyboardEventInit>) {
  const codes: Record<string, number> = { Escape: 27, " ": 32 };
  e.view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      keyCode: codes[key] ?? 0,
      bubbles: true,
      cancelable: true,
      ...mods,
    }),
  );
}

describe("multi-cursor", () => {
  it("keeps several cursors and types at every one", () => {
    const e = mount("one\ntwo\nthree");
    e.view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(4),
        EditorSelection.cursor(8),
      ]),
    });
    expect(cursors(e)).toEqual([
      [0, 0],
      [4, 4],
      [8, 8],
    ]);
    e.view.dispatch(e.view.state.replaceSelection("-"));
    expect(e.getText()).toBe("-one\n-two\n-three");
  });

  it("Escape collapses several cursors to one", () => {
    const e = mount("one\ntwo");
    e.view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(4),
      ]),
    });
    press(e, "Escape", {});
    expect(e.view.state.selection.ranges).toHaveLength(1);
  });
});

describe("Live Preview with several cursors", () => {
  it("reveals the raw syntax of every construct a cursor is in", () => {
    const doc = "[[A]] mid [[B]] end [[C]]";
    const parent = document.createElement("div");
    document.body.append(parent);
    const e = createEditor({ parent, doc, providers: inlineProviders });
    handles.push(e);
    e.view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(3),
        EditorSelection.cursor(13),
      ]),
    });
    const hiddenFrom: number[] = [];
    e.view.state
      .field(decorationsField)
      .between(0, doc.length, (from, _t, v) => {
        const spec = v.spec as { class?: string; tagName?: string };
        if (!spec.class && !spec.tagName) hiddenFrom.push(from);
      });
    // Only the third link, with no cursor in it, keeps its brackets hidden.
    expect(hiddenFrom).toEqual([20, 23]);
  });
});

describe("the [[ picker with several cursors", () => {
  const candidates = [{ path: "Roadmap.md" }];
  const tick = () => new Promise((r) => setTimeout(r, 80));
  function mountPicker(doc: string) {
    const parent = document.createElement("div");
    document.body.append(parent);
    const handle = createEditor({
      parent,
      doc,
      extensions: [pickerExtension({ candidates })],
    });
    handles.push(handle);
    return handle;
  }
  const typeAt = (e: EditorHandle, text: string) =>
    e.view.dispatch({
      ...e.view.state.changeByRange((r) => ({
        changes: { from: r.from, to: r.to, insert: text },
        range: EditorSelection.cursor(r.from + text.length),
      })),
      userEvent: "input.type",
    });

  it("opens with one cursor", async () => {
    const e = mountPicker("");
    typeAt(e, "[[");
    await tick();
    expect(completionStatus(e.view.state)).toBe("active");
  });

  it("stays closed when [[ is typed at two cursors", async () => {
    const e = mountPicker("\n");
    e.view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(1),
      ]),
    });
    typeAt(e, "[[");
    await tick();
    expect(e.getText()).toBe("[[\n[[");
    expect(completionStatus(e.view.state)).toBeNull();
  });

  it("Ctrl-Space does nothing with two cursors inside [[…]]", async () => {
    const e = mountPicker("[[]]\n[[]]");
    e.view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(2),
        EditorSelection.cursor(7),
      ]),
    });
    press(e, " ", { ctrlKey: true });
    await tick();
    expect(completionStatus(e.view.state)).toBeNull();
  });

  it("Ctrl-Space opens it with one cursor inside [[…]]", async () => {
    const e = mountPicker("[[]]");
    e.view.dispatch({ selection: { anchor: 2 } });
    press(e, " ", { ctrlKey: true });
    await tick();
    expect(completionStatus(e.view.state)).toBe("active");
  });
});
