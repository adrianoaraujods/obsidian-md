// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createEditor } from "../../src/editor/index.js";

const repo = resolve(import.meta.dirname, "../../../..");
const roots = [
  "packages/remark-obsidian-md/tests/fixtures",
  "packages/fumadocs-obsidian-md/tests/fixtures",
  "examples/fumadocs/tests/fixtures/vault",
].map((r) => join(repo, r));

function notes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return notes(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

const corpus = roots.flatMap(notes);

const oddNotes: Record<string, string> = {
  crlf: "# T\r\nline [[A]]\r\n\r\n> [!note] x\r\n> body\r\n",
  "no trailing newline": "text ==h== end",
  "odd frontmatter": "---\n: : [odd\n  - {\n---\n[[A]]\n",
  "unclosed frontmatter": "---\ntitle: x\nbody",
  "html and angle brackets": "a<br>b <!-- c --> a < b <https://x.y> [[A]]\n",
  "mixed endings": "a\r\nb\nc\r\n",
  "lone CR": "a\rb\n",
};

function mount(doc: string) {
  const parent = document.createElement("div");
  return createEditor({ parent, doc });
}

describe("corpus: Save payload is byte-identical", () => {
  it("found the fixture Notes", () => {
    expect(corpus.length).toBeGreaterThan(10);
  });

  it.each(corpus.map((p) => [p.slice(repo.length + 1), p]))(
    "%s",
    (_name, path) => {
      const doc = readFileSync(path as string, "utf8");
      const editor = mount(doc);
      editor.reparse();
      expect(editor.getText()).toBe(doc);
      editor.destroy();
    },
  );

  it.each(Object.entries(oddNotes))("opens %s without error", (_n, doc) => {
    const editor = mount(doc);
    editor.reparse();
    expect(editor.getText()).toBe(doc);
    editor.destroy();
  });
});

describe("edit changes only the edited range", () => {
  it.each(corpus.slice(0, 12).map((p) => [p.slice(repo.length + 1), p]))(
    "%s",
    (_name, path) => {
      const doc = readFileSync(path as string, "utf8");
      const from = Math.floor(doc.length / 3);
      const to = Math.min(doc.length, from + 4);
      const editor = mount(doc);
      editor.view.dispatch({ changes: { from, to, insert: "EDIT" } });
      editor.reparse();
      expect(editor.getText()).toBe(
        `${doc.slice(0, from)}EDIT${doc.slice(to)}`,
      );
      editor.destroy();
    },
  );
});
