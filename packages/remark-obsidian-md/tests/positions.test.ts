import { fromMarkdown } from "mdast-util-from-markdown";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { Node } from "unist";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";

import remarkObsidianMd, {
  commentFromMarkdown,
  commentSyntax,
  mapResolver,
} from "../src/index.js";

/** The raw source each node of `type` covers, in document order. */
function slices(source: string, tree: Node, type: string): string[] {
  const found: string[] = [];
  visit(tree, type, (node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    found.push(
      start === undefined ? "<no position>" : source.slice(start, end),
    );
  });
  return found;
}

function parse(source: string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidianMd, {
      resolver: mapResolver({
        Note: { path: "/Note.md" },
        Img: { path: "/img.png" },
      }),
      readNote: () => undefined,
    });
  return processor.runSync(processor.parse(source), { value: source });
}

describe("source positions", () => {
  it("Wiki Link covers [[…]], resolved or not", () => {
    const source = "a [[Note|alias]] b [[Missing]] c";
    const links = slices(source, parse(source), "link");

    expect(links).toEqual(["[[Note|alias]]", "[[Missing]]"]);
  });

  it("Wiki Link as plain text covers [[…]]", () => {
    const processor = unified()
      .use(remarkParse)
      .use(remarkObsidianMd, { wikiLinks: { unresolvedStrategy: "plain" } });
    const source = "x [[Missing]] y";
    const tree = processor.runSync(processor.parse(source), { value: source });

    expect(slices(source, tree, "text")).toContain("[[Missing]]");
  });

  it("Embed covers ![[…]]", () => {
    const source = "text ![[Img.png]] more\n\n![[Note]]";
    const tree = parse(source);

    expect(slices(source, tree, "embed")).toEqual([
      "![[Img.png]]",
      "![[Note]]",
    ]);
  });

  it("Highlight covers ==…==, plain or with nested markup", () => {
    const source = "a ==plain== b ==with **bold**== c";
    const tree = parse(source);
    const marks = slices(source, tree, "text").filter((s) => s.includes("=="));
    const containers = slices(source, tree, "obsidianHighlight");

    expect(marks).toEqual(["==plain=="]);
    expect(containers).toEqual(["==with **bold**=="]);
  });

  it("Footnote covers ^[…], plain or with nested markup", () => {
    const source = "a^[plain] b^[with *em*] c";
    const tree = parse(source);
    const plain = slices(source, tree, "text").filter((s) =>
      s.startsWith("^["),
    );

    expect(plain).toEqual(["^[plain]"]);
    expect(slices(source, tree, "obsidianFootnote")).toEqual(["^[with *em*]"]);
  });

  it("Comment covers %%…%%, closed or not", () => {
    const source = "a %%hid%% b %%open";
    const tree = fromMarkdown(source, {
      extensions: [commentSyntax],
      mdastExtensions: [commentFromMarkdown],
    });

    expect(slices(source, tree, "obsidianComment")).toEqual([
      "%%hid%%",
      "%%open",
    ]);
  });

  it("Callout covers its whole blockquote, nested ones included", () => {
    const source = "> [!note] Title\n> body\n>\n> > [!tip]\n> > inner\n";
    const callouts = slices(source, parse(source), "callout");

    expect(callouts).toEqual([
      "> [!note] Title\n> body\n>\n> > [!tip]\n> > inner",
      "> [!tip]\n> > inner",
    ]);
  });

  it("Callout title and body keep positions on their own source", () => {
    const source = "> [!note]- Some *title*\n> first\n> second\n";
    const tree = parse(source);
    const texts = slices(source, tree, "text");

    expect(texts).toContain("Some ");
    expect(texts.join("|")).not.toContain("[!note]");
    expect(texts).toContain("first\n> second");
  });

  it("Block ID covers ^id and the block text stops before it", () => {
    const source = "para text ^abc-1\n\n- item ^blk\n";
    const tree = parse(source);
    const ids: string[] = [];
    visit(tree, (node) => {
      const id = (node.data as { blockId?: { position: Node["position"] } })
        ?.blockId;
      if (id?.position) {
        ids.push(
          source.slice(id.position.start.offset, id.position.end.offset),
        );
      }
    });

    expect(ids).toEqual(["^abc-1", "^blk"]);
    expect(slices(source, tree, "text")).toEqual(["para text", "item"]);
  });
});
