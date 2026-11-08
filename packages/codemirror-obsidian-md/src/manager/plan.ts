import { createSlugifyPath } from "remark-obsidian-md/syntax";

import { checkSegments } from "../paths.js";
import type { Changeset } from "../storage/types.js";
import { aliasesOf, buildWorld, rewriteNote } from "./links.js";

/**
 * A staged change: the file at `from` ends up at `to` (Vault-relative paths).
 * When `from` is a folder, everything in it follows.
 */
export interface StagedChange {
  type: "move";
  from: string;
  to: string;
}

export interface PlanInput {
  /** Vault-relative path of every file (Notes and Assets). */
  files: readonly string[];
  /** Staged changes, applied in order, each against the Vault as the previous left it. */
  changes: readonly StagedChange[];
  /**
   * The text of the Vault's Notes, by path, as the Vault is now. Given it, the
   * plan also rewrites the links the changes would break; a Note missing from
   * it is left alone.
   */
  notes?: Readonly<Record<string, string>>;
  /** Prefix of the Wiki's URLs (e.g. `/docs`); defaults to none. */
  urlPrefix?: string;
}

/** A Note whose links the commit rewrites. */
export interface PlannedRewrite {
  /** The Note's path once the changes are applied. */
  path: string;
  /** How many links in it change. */
  links: number;
}

/** A Note URL the changes alter. Old URLs do not redirect. */
export interface PlannedUrl {
  /** The Note's path once the changes are applied. */
  path: string;
  from: string;
  to: string;
}

/** One net move, with the wording the commit uses for it. */
export interface PlannedMove {
  kind: "Move" | "Rename";
  from: string;
  to: string;
}

export type ReorganizationPlan =
  | {
      ok: true;
      /** One rename per file that ends up somewhere else. */
      changeset: Changeset;
      moves: PlannedMove[];
      /** What the user staged, one per file or folder moved or renamed (a folder counts once). */
      items: PlannedMove[];
      /** The Notes whose links are rewritten; their `write` changes follow the renames in `changeset`. */
      rewrites: PlannedRewrite[];
      /** Every Note URL that changes. */
      urls: PlannedUrl[];
      /** Commit subject (ADR 0017); empty when nothing changes. */
      subject: string;
      /** Commit body: one line per change. */
      body: string;
      /** The Vault's files after the set is applied. */
      files: string[];
    }
  | { ok: false; error: string; index: number };

function split(path: string): { folder: string; name: string } {
  const slash = path.lastIndexOf("/");
  return slash < 0
    ? { folder: "", name: path }
    : { folder: path.slice(0, slash), name: path.slice(slash + 1) };
}

/** Where `path` lands when moved into `folder` (empty means the Vault root), keeping its file name. */
export function movedPath(path: string, folder: string): string {
  const { name } = split(path);
  const clean = folder.trim().replace(/\/+$/, "");
  return clean === "" ? name : `${clean}/${name}`;
}

/**
 * Where `path` lands when renamed to `name`, staying in its folder. A Note
 * keeps its `.md`: it is added when the typed name lacks it.
 */
export function renamedPath(path: string, name: string): string {
  const { folder, name: old } = split(path);
  let next = name.trim();
  if (old.toLowerCase().endsWith(".md") && !next.toLowerCase().endsWith(".md"))
    next = `${next}.md`;
  return folder === "" ? next : `${folder}/${next}`;
}

function extension(path: string): string {
  const name = split(path).name;
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

function checkTarget(to: string): string | null {
  const error = checkSegments(to, "path");
  if (error) return error;
  const { name } = split(to);
  const stem = name.slice(0, name.length - extension(name).length);
  if (stem.trim() === "") return "Enter a name.";
  return null;
}

function kindOf(from: string, to: string): "Move" | "Rename" {
  return split(from).folder === split(to).folder ? "Rename" : "Move";
}

/**
 * Turn staged changes into the one changeset that commits them, or the first
 * reason they cannot be applied. Pure: nothing touches storage.
 */
export function planReorganization(input: PlanInput): ReorganizationPlan {
  const current = new Set(input.files);
  // Where each file that moved started, keyed by where it is now.
  const origin = new Map<string, string>();

  // What the user sees as one change each: a file, or a folder with all it holds.
  const items: { from: string; to: string }[] = [];

  for (const [index, change] of input.changes.entries()) {
    const fail = (error: string): ReorganizationPlan => ({
      ok: false,
      error,
      index,
    });
    const { from, to } = change;
    const inside = [...current].filter((p) => p.startsWith(`${from}/`));
    const isFolder = !current.has(from) && inside.length > 0;
    if (!current.has(from) && !isFolder)
      return fail(`"${from}" is not in the Vault.`);

    let pairs: [string, string][];
    if (isFolder) {
      const error = checkSegments(to, "path");
      if (error) return fail(error);
      if (to === from || to.startsWith(`${from}/`))
        return fail(`"${from}" cannot be moved into itself.`);
      pairs = inside.map((p) => [p, `${to}${p.slice(from.length)}`]);
      // Lift the folder out first, so a case-only rename does not clash with itself.
      for (const [p] of pairs) current.delete(p);
      const lower = `${to.toLowerCase()}/`;
      for (const path of current) {
        if (path.toLowerCase() === to.toLowerCase() || path === to)
          return fail(`"${to}" already exists.`);
        if (path.startsWith(`${to}/`)) return fail(`"${to}" already exists.`);
        if (path.toLowerCase().startsWith(lower))
          return fail(
            `"${to}" differs only in case from the existing "${path.slice(0, to.length)}".`,
          );
      }
    } else {
      const invalid = checkTarget(to);
      if (invalid) return fail(invalid);
      if (extension(from) !== extension(to))
        return fail(
          `"${split(to).name}" has a different extension from "${split(from).name}".`,
        );
      if (to !== from) {
        if (current.has(to)) return fail(`"${to}" already exists.`);
        const lower = to.toLowerCase();
        for (const path of current) {
          if (path !== from && path.toLowerCase() === lower)
            return fail(
              `"${to}" differs only in case from the existing "${path}".`,
            );
        }
      }
      current.delete(from);
      pairs = [[from, to]];
    }
    for (const [oldPath, newPath] of pairs) {
      current.add(newPath);
      origin.set(newPath, origin.get(oldPath) ?? oldPath);
      if (newPath !== oldPath) origin.delete(oldPath);
    }
    const item = items.find((i) => i.to === from);
    if (item) item.to = to;
    else items.push({ from, to });
  }

  const moves: PlannedMove[] = [];
  for (const [to, from] of origin) {
    if (from === to) continue;
    moves.push({ kind: kindOf(from, to), from, to });
  }
  // A rename may land on a path another move is vacating, so order the set
  // until each target is free; a cycle has no such order.
  const pending = [...moves];
  const ordered: PlannedMove[] = [];
  while (pending.length > 0) {
    const next = pending.findIndex(
      (m) => !pending.some((other) => other !== m && other.from === m.to),
    );
    if (next < 0)
      return {
        ok: false,
        error: "Items cannot swap names in one commit; move one aside first.",
        index: input.changes.length - 1,
      };
    ordered.push(...pending.splice(next, 1));
  }
  const changeset: Changeset = ordered.map(({ from, to }) => ({
    type: "rename",
    from,
    to,
  }));

  const movedTo = new Map(moves.map((m) => [m.from, m.to]));
  const after = [...current].sort();
  const rewrites: PlannedRewrite[] = [];
  if (input.notes) {
    const notes = input.notes;
    const before = buildWorld(input.files, (path) => aliasesOf(notes[path]));
    const afterWorld = buildWorld(after, (path) => {
      const old = [...movedTo].find(([, to]) => to === path)?.[0] ?? path;
      return aliasesOf(notes[old]);
    });
    for (const from of [...input.files].sort()) {
      const source = notes[from];
      if (source === undefined || !/\.md$/i.test(from)) continue;
      const to = movedTo.get(from) ?? from;
      const result = rewriteNote(source, {
        before,
        after: afterWorld,
        moved: movedTo,
        from,
        to,
      });
      if (result.links === 0) continue;
      changeset.push({ type: "write", path: to, content: result.content });
      rewrites.push({ path: to, links: result.links });
    }
  }

  const prefix = (input.urlPrefix ?? "").replace(/^\/+|\/+$/g, "");
  const notePaths = (paths: readonly string[]) =>
    paths.filter((p) => /\.md$/i.test(p));
  const slugBefore = createSlugifyPath(notePaths(input.files));
  const slugAfter = createSlugifyPath(notePaths(after));
  const url = (slug: string) => `/${prefix ? `${prefix}/` : ""}${slug}`;
  const urls: PlannedUrl[] = [];
  for (const from of notePaths(input.files).sort()) {
    const to = movedTo.get(from) ?? from;
    const [old, next] = [url(slugBefore(from)), url(slugAfter(to))];
    if (old !== next) urls.push({ path: to, from: old, to: next });
  }

  const changed: PlannedMove[] = items
    .filter((i) => i.from !== i.to)
    .map((i) => ({ kind: kindOf(i.from, i.to), from: i.from, to: i.to }));
  let subject = "";
  const [only] = changed;
  if (only && changed.length === 1) subject = `${only.kind} ${only.from}`;
  else if (changed.length > 1) subject = `Reorganize ${changed.length} items`;

  return {
    ok: true,
    changeset,
    moves,
    items: changed,
    rewrites,
    urls,
    subject,
    body: [
      ...changed.map((m) => `- ${m.kind} ${m.from} → ${m.to}`),
      ...rewrites.map((r) => `- Update ${r.links} link(s) in ${r.path}`),
    ].join("\n"),
    files: after,
  };
}
