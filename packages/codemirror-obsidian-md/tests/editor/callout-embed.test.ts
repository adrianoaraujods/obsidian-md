// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { createEditor, type EditorHandle } from "../../src/editor/index.js";
import { calloutEmbed } from "../../src/editor/providers/callout-embed.js";

const handles: EditorHandle[] = [];
function mount(doc: string, options: Parameters<typeof calloutEmbed>[0] = {}) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const handle = createEditor({
    parent,
    doc,
    extensions: [calloutEmbed(options)],
  });
  handles.push(handle);
  handle.view.dispatch({ selection: { anchor: doc.length } });
  return handle;
}
function moveTo(editor: EditorHandle, pos: number) {
  editor.view.dispatch({ selection: { anchor: pos } });
}
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
});

const CALLOUT = "intro\n\n> [!warning] Careful\n> body line\n\nafter";

describe("Callout Live Preview", () => {
  it("clicking the rendered title reveals the raw line with the cursor in the title", () => {
    const editor = mount(CALLOUT);
    const dom = editor.view.dom;
    dom
      .querySelector(".callout-title-inner")
      ?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    expect(dom.querySelector(".callout-title")).toBeNull();
    expect(dom.querySelector(".cm-callout-first")?.textContent).toBe(
      "> [!warning] Careful",
    );
    const head = editor.view.state.selection.main.head;
    expect(editor.view.state.doc.lineAt(head).text).toBe(
      "> [!warning] Careful",
    );
    expect(head).toBeGreaterThanOrEqual(CALLOUT.indexOf("Careful"));
  });

  it("clicking the icon reveals the raw line too", () => {
    const editor = mount(CALLOUT);
    const dom = editor.view.dom;
    dom
      .querySelector(".callout-title-icon")
      ?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    expect(dom.querySelector(".callout-title")).toBeNull();
    expect(dom.querySelector(".cm-callout-first")?.textContent).toContain(
      "[!warning]",
    );
  });

  it("renders the type's name, icon and title like the Wiki", () => {
    const editor = mount(CALLOUT);
    const dom = editor.view.dom;
    expect(
      dom.querySelector(".callout[data-callout='warning']"),
    ).not.toBeNull();
    expect(
      dom.querySelector(".callout-title-icon")?.getAttribute("data-icon"),
    ).toBe("alert-triangle");
    expect(dom.querySelector(".callout-title-inner")?.textContent).toBe(
      "Careful",
    );
    expect(dom.querySelector(".callout-content")?.textContent).toBe(
      "body line",
    );
    expect(dom.textContent).not.toContain("[!warning]");
  });

  it("uses the canonical type for aliases and the typed label as default title", () => {
    const editor = mount("> [!tldr]\n> x\n\nend");
    const dom = editor.view.dom;
    expect(
      dom.querySelector(".callout[data-callout='abstract']"),
    ).not.toBeNull();
    expect(dom.querySelector(".callout-title-inner")?.textContent).toBe("Tldr");
  });

  it("falls back to note for unknown types and honors custom types", () => {
    const unknown = mount("> [!whatever]\n> x\n\nend");
    expect(
      unknown.view.dom.querySelector(".callout[data-callout='note']"),
    ).not.toBeNull();
    const custom = mount("> [!mine]\n> x\n\nend", {
      types: { mine: { icon: "star", color: "red", title: "Mine!" } },
    });
    const dom = custom.view.dom;
    expect(dom.querySelector(".callout[data-callout='mine']")).not.toBeNull();
    expect(
      dom.querySelector(".callout-title-icon")?.getAttribute("data-icon"),
    ).toBe("star");
    expect(dom.querySelector(".callout-title-inner")?.textContent).toBe(
      "Mine!",
    );
  });

  it("leaves a plain blockquote alone", () => {
    const editor = mount("> just a quote");
    expect(editor.view.dom.querySelector(".callout")).toBeNull();
    expect(editor.view.dom.textContent).toContain("> just a quote");
  });

  it("reveals the raw syntax with the cursor inside, and renders again outside", () => {
    const editor = mount(CALLOUT);
    moveTo(editor, CALLOUT.indexOf("body"));
    expect(editor.view.dom.querySelector(".callout-title-inner")).toBeNull();
    expect(editor.view.dom.textContent).toContain("> [!warning] Careful");
    moveTo(editor, CALLOUT.length);
    expect(
      editor.view.dom.querySelector(".callout-title-inner"),
    ).not.toBeNull();
  });
});

describe("Embed Live Preview", () => {
  it("renders an Asset Embed as its image with alt and size", () => {
    const editor = mount("see ![[pic.png|300x200]] here", {
      resolveAsset: (t) => `/assets/${t}`,
    });
    const img = editor.view.dom.querySelector("img.internal-embed");
    expect(img?.getAttribute("src")).toBe("/assets/pic.png");
    expect(img?.getAttribute("width")).toBe("300");
    expect(img?.getAttribute("height")).toBe("200");
    expect(img?.classList.contains("internal-embed")).toBe(true);
    expect(editor.view.dom.textContent).not.toContain("![[");
  });

  it("uses a non-numeric alias as alt text", () => {
    const editor = mount("![[pic.png|A cat]] end");
    expect(
      editor.view.dom.querySelector("img.internal-embed")?.getAttribute("alt"),
    ).toBe("A cat");
  });

  it("shows a Note Embed as a chip without its content", () => {
    const editor = mount("x ![[Other Note#Heading]] y");
    const chip = editor.view.dom.querySelector(".internal-embed");
    expect(chip?.tagName).not.toBe("IMG");
    expect(chip?.textContent).toBe("Other Note#Heading");
    expect(editor.view.dom.querySelector("img.internal-embed")).toBeNull();
  });

  it("reveals the raw Embed with the cursor inside", () => {
    const doc = "x ![[pic.png]] y";
    const editor = mount(doc);
    moveTo(editor, 5);
    expect(editor.view.dom.querySelector("img.internal-embed")).toBeNull();
    expect(editor.view.dom.textContent).toContain("![[pic.png]]");
  });
});

describe("Save payload", () => {
  it("is byte-identical to the Note whatever is rendered", () => {
    const doc = `${CALLOUT}\r\n![[pic.png]] ![[Note]]`;
    const editor = mount(doc);
    expect(editor.getText()).toBe(doc);
    moveTo(editor, 3);
    expect(editor.getText()).toBe(doc);
  });
});
