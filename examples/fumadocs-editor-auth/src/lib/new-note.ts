import { createSlugifyPath } from "remark-obsidian-md";

/** The folder part of a Vault path; empty at the Vault root. */
export function folderOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

const slugOf = (path: string, existing: readonly string[]) =>
  createSlugifyPath([...existing, path])(path);

/**
 * Where the editor opens a Note that was just created. The build does not
 * know the Note yet (the Wiki is static until the redeploy), so the path rides
 * along as `?new=` for the edit page to use in place of the missing page.
 *
 * @param existing Vault paths of the Notes in the build, so the slug is the
 *   one the redeployed Note will get.
 */
export function createdNoteHref(
  path: string,
  existing: readonly string[],
): string {
  const slug = slugOf(path, existing).split("/").map(encodeURIComponent);
  return `/edit/${slug.join("/")}?${new URLSearchParams({ new: path })}`;
}

/** Whether `?new=<path>` really is the Note that `slug` names. */
export function createdNoteMatches(
  slug: string[],
  path: string,
  existing: readonly string[],
): boolean {
  if (!path || path.startsWith("/") || path.split("/").includes("..")) {
    return false;
  }
  return slugOf(path, existing) === slug.join("/");
}
