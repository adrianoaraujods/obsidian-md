import path from "node:path";
import { pageSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { createMdxOptions } from "fumadocs-obsidian-md";
import rehypeKatex from "rehype-katex";
import rehypeMermaid from "rehype-mermaid";
import remarkMath from "remark-math";
import { getFrontmatter } from "remark-obsidian-md";
import z from "zod";
import { vaultConfig } from "./src/lib/vault";
import { vaultDir } from "./src/lib/vault-dir";

const { resolver, propertyTypes, slugifyPath } = vaultConfig;

export const vault = defineDocs({
  dir: vaultDir,
  docs: {
    schema: (context) =>
      pageSchema
        .extend({
          title: z.string().default(() => path.parse(context.path).name),
        })
        // Keep custom frontmatter keys (Etiquetas, aliases, cssclasses…) and
        // resolve their wiki links at build time, under `properties`.
        .catchall(z.unknown())
        .transform((frontmatter) => ({
          ...frontmatter,
          properties: getFrontmatter(frontmatter, {
            resolver,
            slugifyPath,
            types: propertyTypes,
          }),
        })),
  },
});

export default defineConfig({
  mdxOptions: {
    ...createMdxOptions(vaultConfig, {
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex, rehypeMermaid],
    }),
  },
});
