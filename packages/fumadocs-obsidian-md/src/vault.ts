import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createSlugifyPath,
  filesystemPropertyTypes,
  filesystemResolver,
  slugify,
} from "remark-obsidian-md";

/**
 * Everything derived from one Vault directory: the resolver, the slug
 * function and the Frontmatter property types. The plugin, the frontmatter
 * helper and the site generator all share the same slug map, so a link and
 * the Note it points at can never disagree.
 */
export function createVault(dir: string) {
  const resolver = filesystemResolver(dir);
  const propertyTypes = filesystemPropertyTypes(dir);
  const slugifyPath = createSlugifyPath(resolver.paths);

  /** Notes published under a slug other than their plain one. */
  const slugRenames = resolver.paths.filter(
    (notePath) => slugifyPath(notePath) !== plainSlug(notePath),
  );

  /** Source of a Note by its Vault-relative path, for Embeds. */
  function readNote(notePath: string): string | undefined {
    try {
      return readFileSync(path.join(dir, notePath), "utf8");
    } catch {
      return undefined;
    }
  }

  return { dir, resolver, propertyTypes, slugifyPath, slugRenames, readNote };
}

export type Vault = ReturnType<typeof createVault>;

function plainSlug(notePath: string): string {
  const segments = notePath
    .replace(/\.mdx?$/i, "")
    .split("/")
    .filter(Boolean);

  // An `index` Note is published under its folder.
  if (segments.at(-1) === "index") segments.pop();

  return segments.map(slugify).join("/");
}
