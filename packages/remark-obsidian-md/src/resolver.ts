import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { normalizeTarget } from "./map-resolver.js";
import { splitFrontmatter } from "./note-frontmatter.js";
import type {
  FilesystemResolver,
  NoteMetadata,
  ResolvedTarget,
} from "./types.js";

/**
 * How to pick a winner when several Notes share a basename or Alias.
 * `"root"` prefers the shallowest path (Obsidian's behaviour), `"first"` and
 * `"last"` follow scan order.
 */
export type DuplicatePolicy = "root" | "first" | "last";

export type FilesystemResolverOptions = {
  duplicatePolicy?: DuplicatePolicy | undefined;
};

type ScanEntry = {
  depth: number;
  target: ResolvedTarget;
  names: string[];
};

/**
 * Builds a Resolver by scanning a Vault directory once, lazily, and caching
 * the resulting index for the Resolver's lifetime.
 *
 * Notes are matched by path, basename and Alias; Assets by path and filename.
 * Matching is case-insensitive and the `.md` extension is optional.
 */
export function filesystemResolver(
  vault: string,
  options: FilesystemResolverOptions = {},
): FilesystemResolver {
  const policy = options.duplicatePolicy ?? "root";
  let scan: Scan | undefined;

  const scanned = () => (scan ??= buildIndex(vault, policy));

  return {
    resolve(target): ResolvedTarget {
      const { index } = scanned();
      return (
        index.get(normalizeTarget(target)) ?? { kind: "note", exists: false }
      );
    },
    get paths(): readonly string[] {
      return scanned().paths;
    },
  };
}

type Scan = {
  index: Map<string, ResolvedTarget>;
  paths: string[];
};

function buildIndex(vault: string, policy: DuplicatePolicy): Scan {
  const winners = new Map<string, ScanEntry>();
  const paths: string[] = [];

  for (const entry of walk(vault, vault)) {
    if (entry.target.exists && entry.target.kind === "note") {
      paths.push(entry.target.path);
    }
    for (const name of entry.names) {
      const key = normalizeTarget(name);
      if (!key) continue;
      const current = winners.get(key);
      if (!current || beats(entry, current, policy)) winners.set(key, entry);
    }
  }

  return {
    index: new Map([...winners].map(([key, entry]) => [key, entry.target])),
    paths: paths.sort(),
  };
}

function* walk(dir: string, root: string): Generator<ScanEntry> {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const dirent of entries) {
    if (dirent.name.startsWith(".")) continue;

    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* walk(full, root);
      continue;
    }
    if (!dirent.isFile()) continue;

    const segments = relative(root, full).split(sep);
    const path = `/${segments.join("/")}`;
    const depth = segments.length;

    if (/\.md$/i.test(dirent.name)) {
      const note = readNote(full, dirent.name);
      yield {
        depth,
        target: { kind: "note", exists: true, path, note },
        names: [path, ...note.aliases, note.title],
      };
    } else {
      yield {
        depth,
        target: {
          kind: "asset",
          exists: true,
          path,
          ext: extname(dirent.name).toLowerCase(),
        },
        names: [path, dirent.name],
      };
    }
  }
}

function beats(
  candidate: ScanEntry,
  current: ScanEntry,
  policy: DuplicatePolicy,
): boolean {
  if (policy === "last") return true;
  if (policy === "first") return false;
  return candidate.depth < current.depth;
}

function readNote(file: string, filename: string): NoteMetadata {
  const { frontmatter } = splitFrontmatter(readFileSync(file, "utf8"));

  return {
    title: filename.replace(/\.md$/i, ""),
    aliases: toStringArray(frontmatter.aliases),
    cssclasses: toStringArray(frontmatter.cssclasses),
  };
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export { type MapResolverEntry, mapResolver } from "./map-resolver.js";
