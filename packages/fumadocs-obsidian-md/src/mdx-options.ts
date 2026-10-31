import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import type { DefaultMDXOptions } from "fumadocs-mdx/config";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkObsidianMd, {
  type RemarkObsidianMdOptions,
} from "remark-obsidian-md";
import type { Pluggable } from "unified";

import { rehypeVaultAssets } from "./rehype-vault-assets.js";
import type { Vault } from "./vault.js";

export interface CreateMdxOptionsConfig {
  /** Static path the Vault is served under. Defaults to `/vault`. */
  assetBase?: string;
  /** Remark plugins that run before remark-obsidian-md (after GFM). */
  remarkPlugins?: Pluggable[];
  /** Rehype plugins that run before the Asset URL rewrite. */
  rehypePlugins?: Pluggable[];
}

/**
 * The MDX options for a Vault, with the plugin pipeline in the right order:
 * GFM, your plugins, remark-obsidian-md, then line breaks. Obsidian renders a
 * single newline as a line break; running remark-breaks after the plugin
 * gives transcluded Embeds that behavior too.
 */
export function createMdxOptions(
  vault: Vault,
  config: CreateMdxOptionsConfig = {},
): DefaultMDXOptions {
  const pluginOptions = {
    resolver: vault.resolver,
    slugifyPath: vault.slugifyPath,
    embeds: { readNote: vault.readNote },
  } satisfies RemarkObsidianMdOptions;

  return {
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      // Vault notes carry Excalidraw payloads as ```compressed-json blocks;
      // Shiki doesn't know that language and fails the build without a fallback.
      fallbackLanguage: "text",
    },
    remarkImageOptions: {
      // remote images in Vault notes are not fetched for sizing during build
      onError: "ignore" as const,
    },
    remarkPlugins: [
      remarkGfm,
      ...(config.remarkPlugins ?? []),
      [remarkObsidianMd, pluginOptions],
      remarkBreaks,
    ] as Pluggable[],
    rehypePlugins: (defaults: Pluggable[]): Pluggable[] => [
      ...(config.rehypePlugins ?? []),
      [rehypeVaultAssets, { base: config.assetBase }],
      ...defaults,
    ],
  };
}
