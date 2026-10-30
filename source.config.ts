import { readFileSync } from "node:fs";
import path from "node:path";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import { pageSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import rehypeKatex from "rehype-katex";
import rehypeMermaid from "rehype-mermaid";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkObsidianMd, {
  filesystemPropertyTypes,
  filesystemResolver,
  getFrontmatter,
  type RemarkObsidianMdOptions,
} from "remark-obsidian-md";
import z from "zod";

import { slugifyPath } from "./src/lib/vault-slugs";

const vaultDir = path.resolve("public/vault");
const resolver = filesystemResolver(vaultDir);
const propertyTypes = filesystemPropertyTypes(vaultDir);

export const vault = defineDocs({
  dir: "public/vault",
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

function readVaultNote(notePath: string): string | undefined {
  try {
    return readFileSync(path.join(vaultDir, notePath), "utf8");
  } catch {
    return undefined;
  }
}

// remark-obsidian-md emits asset URLs as vault-relative paths; the vault is
// served statically under /vault, so asset srcs/hrefs get the prefix here.
const ASSET_URL =
  /\.(png|jpe?g|gif|webp|svg|mp3|mp4|webm|ogv|ogg|wav|m4a|flac|pdf)$/i;

type HastNode = {
  type?: string;
  children?: HastNode[];
  properties?: Record<string, unknown>;
};

function rehypeVaultAssets() {
  const rewrite = (node: HastNode) => {
    if (node.type === "element") {
      node.properties ??= {};
      for (const key of ["src", "href"]) {
        const url = node.properties?.[key];
        if (
          typeof url === "string" &&
          url.startsWith("/") &&
          ASSET_URL.test(url)
        ) {
          node.properties[key] = `/vault${url}`;
        }
      }
    }
    for (const child of node.children ?? []) rewrite(child);
  };
  return (tree: HastNode) => rewrite(tree);
}

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      // Vault notes carry Excalidraw payloads as ```compressed-json blocks; Shiki
      // doesn't know that language and fails the build without a fallback.
      fallbackLanguage: "text",
    },
    remarkImageOptions: {
      // remote images in Vault notes are not fetched for sizing during build
      onError: "ignore",
    },
    remarkPlugins: [
      remarkGfm,
      remarkMath,
      [
        remarkObsidianMd,
        {
          resolver,
          slugifyPath,
          embeds: { readNote: readVaultNote },
        } satisfies RemarkObsidianMdOptions,
      ],
      // Obsidian renders a single newline as a line break (Strict line breaks
      // off). Runs after the plugin so transcluded Embeds get it too.
      remarkBreaks,
    ],
    rehypePlugins: (v) => [rehypeKatex, rehypeMermaid, rehypeVaultAssets, ...v],
  },
});
