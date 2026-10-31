import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { evaluate } from "@mdx-js/mdx";
import { loader } from "fumadocs-core/source";
import * as runtime from "react/jsx-runtime";
import { getFrontmatter } from "remark-obsidian-md";
import type { Pluggable } from "unified";
import { parse } from "yaml";

import { createMdxOptions, createVault } from "../../src/index.js";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * A real Fumadocs source over a fixture Vault: each Note is compiled with the
 * package's own MDX options, as `fumadocs-mdx` does in a Wiki.
 */
export async function createFixtureSource(dirName: string) {
  const vault = createVault(path.resolve("tests/fixtures", dirName));
  const options = createMdxOptions(vault);
  const rehype = options.rehypePlugins as (d: Pluggable[]) => Pluggable[];

  const files = await Promise.all(
    readdirSync(vault.dir)
      .filter((name) => name.endsWith(".md"))
      .map(async (name) => {
        const raw = readFileSync(path.join(vault.dir, name), "utf8");
        const yaml = FRONTMATTER.exec(raw)?.[1] ?? "";
        const frontmatter = parse(yaml) ?? {};
        const { default: body } = await evaluate(
          {
            value: raw.replace(FRONTMATTER, ""),
            path: path.join(vault.dir, name),
          },
          {
            ...runtime,
            remarkPlugins: options.remarkPlugins as Pluggable[],
            rehypePlugins: rehype([]),
          },
        );
        return {
          type: "page" as const,
          path: name,
          data: {
            title: frontmatter.title ?? path.parse(name).name,
            body,
            properties: getFrontmatter(frontmatter, {
              resolver: vault.resolver,
              slugifyPath: vault.slugifyPath,
              types: vault.propertyTypes,
            }),
          },
        };
      }),
  );

  return loader({
    baseUrl: "/",
    source: { files },
    slugs: (file) => vault.slugifyPath(file.path).split("/").filter(Boolean),
  });
}
