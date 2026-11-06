// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  calloutEmbed,
  createEditor,
  type EditorHandle,
  inlineProviders,
  markdownProvider,
  pickerExtension,
} from "../../src/editor/index.js";

const handles: EditorHandle[] = [];
function mount(doc: string) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const handle = createEditor({
    parent,
    doc,
    providers: [...inlineProviders, markdownProvider],
    extensions: [calloutEmbed(), pickerExtension({ candidates: [] })],
  });
  handle.reparse();
  handles.push(handle);
  return { handle, parent };
}
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
});

const style = (el: Element) => getComputedStyle(el);

describe("editor theme", () => {
  it("renders headings larger and bold, h1 above h2", () => {
    const { parent } = mount("# One\n\n## Two\n\ntext");
    const h1 = parent.querySelector(".cm-obsidian-h1") as Element;
    const h2 = parent.querySelector(".cm-obsidian-h2") as Element;
    expect(style(h1).fontWeight).toBe("700");
    expect(Number.parseFloat(style(h1).fontSize)).toBeGreaterThan(
      Number.parseFloat(style(h2).fontSize),
    );
    expect(Number.parseFloat(style(h2).fontSize)).toBeGreaterThan(16);
  });

  it("renders strong bold and emphasis italic", () => {
    const { parent } = mount("**b** and *i*\n\nend");
    expect(
      style(parent.querySelector(".cm-obsidian-strong") as Element).fontWeight,
    ).toBe("700");
    expect(
      style(parent.querySelector(".cm-obsidian-em") as Element).fontStyle,
    ).toBe("italic");
  });

  it("uses a sans-serif body font, not the browser monospace", () => {
    const { parent } = mount("plain");
    const family = style(
      parent.querySelector(".cm-content") as Element,
    ).fontFamily;
    expect(family).not.toMatch(/^monospace$/);
    expect(family).toMatch(/sans-serif/);
  });

  it("draws the cursor in the text color, not black", () => {
    const { handle } = mount("plain");
    const css = [...document.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n");
    expect(css).toMatch(
      /\.cm-cursor[^{]*\{[^}]*border-left-color:\s*currentColor/,
    );
    handle.view.focus();
  });

  it("hides widget buffers so lines with widgets stay one line tall", () => {
    const { parent } = mount("# Title\n\nplain");
    const css = [...document.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n");
    expect(css).toMatch(/\.cm-widgetBuffer[^{]*\{[^}]*display:\s*none/);
    expect(parent).toBeTruthy();
  });

  it("joins a Callout's lines into one box without per-line margins", () => {
    mount("> [!tip] Hi\n> body\n\nend");
    const css = [...document.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n");
    expect(css).toMatch(/\.cm-callout[^{]*\{[^}]*margin:\s*0\b/);
  });

  it("styles the [[ picker with the editor colors", () => {
    mount("x");
    const css = [...document.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n");
    expect(css).toMatch(/\.cm-tooltip-autocomplete/);
    expect(css).toMatch(/\.cm-tooltip-autocomplete[^{]*\{[^}]*var\(--/);
  });
});
