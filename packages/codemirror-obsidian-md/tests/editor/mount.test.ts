// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { createEditor, type EditorHandle } from "../../src/editor/index.js";

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

describe("editor mount", () => {
  it("opens a Note and saves exactly the document text", () => {
    const doc = "---\r\ntitle: x\r\n---\r\n# Hi\r\nbody [[A]] no newline";
    const editor = mount(doc);
    expect(editor.getText()).toBe(doc);
  });

  it("leaves untouched text byte-identical after one edit", () => {
    const doc = "one\r\ntwo\r\nthree";
    const editor = mount(doc);
    editor.view.dispatch({ changes: { from: 5, to: 8, insert: "TWO" } });
    expect(editor.getText()).toBe("one\r\nTWO\r\nthree");
  });
});
