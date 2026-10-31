import path from "node:path";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { createMdxOptions, createVault } from "../src/index.js";

const vault = createVault(path.resolve("tests/fixtures/vault"));

async function render(note: string, assetBase?: string): Promise<string> {
  const options = createMdxOptions(vault, assetBase ? { assetBase } : {});
  const rehype = options.rehypePlugins as (
    v: never[],
  ) => import("unified").PluggableList;
  const file = await unified()
    .use(remarkParse)
    .use(options.remarkPlugins as import("unified").PluggableList)
    .use(remarkRehype)
    .use(rehype([]))
    .use(rehypeStringify)
    .process({
      value: vault.readNote(note) ?? "",
      path: path.join(vault.dir, note),
    });
  return String(file);
}

describe("createMdxOptions", () => {
  it("applies line breaks to transcluded Embeds (breaks run after the plugin)", async () => {
    const html = await render("Outer.md");
    expect(html).toContain("Line one<br>\nLine two");
  });

  it("resolves Asset URLs under /vault in pages", async () => {
    const html = await render("Outer.md");
    expect(html).toContain('src="/vault/pic.png"');
    expect(html).toContain('/vault/Doc.pdf"');
  });

  it("honours a custom asset base", async () => {
    expect(await render("Outer.md", "/static/wiki")).toContain(
      'src="/static/wiki/pic.png"',
    );
  });

  it("leaves Note links alone", async () => {
    expect(await render("Outer.md")).toContain('href="/inner"');
  });
});

describe("createVault", () => {
  it("builds one slug function that agrees with the resolver", () => {
    expect(vault.slugifyPath("Inner.md")).toBe("inner");
    expect(vault.slugRenames).toEqual([]);
  });
});
