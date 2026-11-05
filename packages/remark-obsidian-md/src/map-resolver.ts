import type { NoteMetadata, ResolvedTarget, Resolver } from "./types.js";
import { normalizePath } from "./utils.js";

/** A Note supplied to {@link mapResolver}. */
export type MapResolverEntry = {
  path: string;
  title?: string;
  aliases?: string[];
  cssclasses?: string[];
};

/**
 * Builds a Resolver from a caller-supplied map instead of a filesystem scan.
 *
 * Entries are matched case-insensitively, with or without the `.md`
 * extension, by their key, full path, basename or Alias.
 */
export function mapResolver(map: Record<string, MapResolverEntry>): Resolver {
  const index = new Map<string, MapResolverEntry>();
  const depths = new Map<string, number>();

  for (const [key, entry] of Object.entries(map)) {
    const basename = entry.path.split("/").pop() ?? entry.path;
    const depth = entry.path.split("/").filter(Boolean).length;

    for (const name of [key, entry.path, basename, ...(entry.aliases ?? [])]) {
      const id = normalizeTarget(name);
      if (!id) continue;
      // Root-wins on duplicate basenames: the shallowest path takes the name.
      const known = depths.get(id);
      if (known === undefined || depth < known) {
        index.set(id, entry);
        depths.set(id, depth);
      }
    }
  }

  return {
    resolve(target): ResolvedTarget {
      const entry = index.get(normalizeTarget(target));
      if (!entry) return { kind: "note", exists: false };

      const note: NoteMetadata = {
        title: entry.title ?? titleOf(entry.path),
        aliases: entry.aliases ?? [],
        cssclasses: entry.cssclasses ?? [],
      };

      return { kind: "note", exists: true, path: entry.path, note };
    },
  };
}

export function normalizeTarget(target: string): string {
  return normalizePath(target).toLowerCase();
}

function titleOf(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.mdx?$/i, "");
}
