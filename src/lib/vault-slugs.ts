import {
  createSlugifyPath,
  filesystemResolver,
  slugify,
} from "remark-obsidian-md";

import { vaultDir } from "@/lib/vault-dir";

const resolver = filesystemResolver(vaultDir);
const paths = resolver.paths;

/**
 * One slug map for the whole Vault: the plugin, the frontmatter helper and
 * the site generator all publish a Note under the same URL, so a link and the
 * Note it points at can never disagree.
 */
export const slugifyPath = createSlugifyPath(paths);

/** Notes published under a slug other than their plain one. */
export const slugRenames = paths.filter(
  (notePath) => slugifyPath(notePath) !== plainSlug(notePath),
);

function plainSlug(notePath: string): string {
  const segments = notePath
    .replace(/\.mdx?$/i, "")
    .split("/")
    .filter(Boolean);

  // An `index` Note is published under its folder.
  if (segments.at(-1) === "index") segments.pop();

  return segments.map(slugify).join("/");
}
