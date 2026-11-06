// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  blockIdParser,
  calloutEmbed,
  createEditor,
  type EditorHandle,
  inlineProviders,
  markdownProvider,
  pickerExtension,
} from "../../src/editor/index.js";

const handles: EditorHandle[] = [];
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
  document.body.innerHTML = "";
});

// One Note that exercises every construct the Live Preview providers decorate,
// with the cursor on the last line so the others render.
const NOTE = [
  "# Heading",
  "",
  "**b** *i* `c` ==hl== ==🔴red== [[Wiki]] %%com%% ^[foot] para ^blk",
  "",
  "> quote",
  "",
  "- bullet",
  "- [ ] open",
  "- [x] done",
  "",
  "> [!tip] Title",
  "> body",
  "",
  "![[pic.png]] ![[Other Note]]",
  "",
  "end",
].join("\n");

function mount(doc: string, cursor?: number) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const handle = createEditor({
    parent,
    doc,
    providers: [...inlineProviders, markdownProvider],
    parser: blockIdParser(),
    extensions: [
      calloutEmbed({ resolveAsset: (t) => `/${t}` }),
      pickerExtension({ candidates: [] }),
    ],
  });
  handles.push(handle);
  handle.view.dispatch({ selection: { anchor: cursor ?? doc.length } });
  handle.reparse();
  return { handle, parent };
}

const stylesheet = () => {
  const style = document.createElement("style");
  style.textContent = readFileSync(
    join(process.cwd(), "src/editor/styles.css"),
    "utf8",
  );
  document.head.append(style);
  return style;
};

describe("the editor stylesheet is opt-in", () => {
  it("createEditor alone does not style headings, emphasis or the cursor", () => {
    const { parent } = mount("# One\n\n**b** and *i*\n\nend");
    const h1 = parent.querySelector(".cm-obsidian-h1") as Element;
    expect(getComputedStyle(h1).fontWeight).not.toBe("700");
    expect(getComputedStyle(h1).fontSize).not.toBe("2em");
    const strong = parent.querySelector(".cm-obsidian-strong") as Element;
    expect(getComputedStyle(strong).fontWeight).not.toBe("700");
    const css = [...document.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n");
    expect(css).not.toContain("cm-obsidian");
  });

  it("is exported as a CSS subpath that points at a shipped file", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { exports: Record<string, unknown>; files: string[] };
    expect(pkg.exports["./styles.css"]).toBe("./dist/styles.css");
    expect(pkg.files).toContain("dist");
  });
});

describe("the editor stylesheet", () => {
  it("has a rule for every cm-* class the providers emit", () => {
    const { parent } = mount(NOTE);
    const sheet = stylesheet().sheet as CSSStyleSheet;
    const selectors = [...sheet.cssRules]
      .flatMap((r) => ("selectorText" in r ? [String(r.selectorText)] : []))
      .join(" ");
    const emitted = new Set<string>();
    // Revealed forms: put the cursor inside each construct in turn.
    for (const el of parent.querySelectorAll("[class*='cm-']")) {
      for (const c of el.classList) {
        if (/^cm-(obsidian|callout|embed)/.test(c)) emitted.add(c);
      }
    }
    for (const marker of ["# H", "==h", "[[W", "%%c", "^[f", "^bl"]) {
      const { parent: p } = mount(NOTE, NOTE.indexOf(marker) + marker.length);
      for (const el of p.querySelectorAll("[class*='cm-']")) {
        for (const c of el.classList) {
          if (/^cm-(obsidian|callout|embed)/.test(c)) emitted.add(c);
        }
      }
    }
    expect(emitted.size).toBeGreaterThan(10);
    const missing = [...emitted].filter((c) => !selectors.includes(`.${c}`));
    expect(missing).toEqual([]);
  });

  it("styles headings from h1 down to h6 as a decreasing scale", () => {
    stylesheet();
    const doc = [
      "# a",
      "## b",
      "### c",
      "#### d",
      "##### e",
      "###### f",
      "",
      "end",
    ].join("\n");
    const { parent } = mount(doc);
    const sizes = [1, 2, 3, 4, 5, 6].map(
      (n) =>
        getComputedStyle(parent.querySelector(`.cm-obsidian-h${n}`) as Element)
          .fontSize,
    );
    expect(sizes).toHaveLength(6);
    for (const s of sizes) expect(s).not.toBe("");
    expect(new Set(sizes).size).toBeGreaterThan(1);
  });
});
