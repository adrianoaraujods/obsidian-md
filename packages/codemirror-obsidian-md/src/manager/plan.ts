import { checkSegments } from "../paths.js";
import type { Changeset } from "../storage/types.js";

/** A staged change: the file at `from` ends up at `to` (Vault-relative paths). */
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

  for (const [index, change] of input.changes.entries()) {
    const fail = (error: string): ReorganizationPlan => ({
      ok: false,
      error,
      index,
    });
    const { from, to } = change;
    if (!current.has(from)) return fail(`"${from}" is not in the Vault.`);
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
    current.add(to);
    origin.set(to, origin.get(from) ?? from);
    if (to !== from) origin.delete(from);
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

  let subject = "";
  const [only] = moves;
  if (only && moves.length === 1) subject = `${only.kind} ${only.from}`;
  else if (moves.length > 1) subject = `Reorganize ${moves.length} items`;

  return {
    ok: true,
    changeset,
    moves,
    subject,
    body: moves.map((m) => `- ${m.kind} ${m.from} → ${m.to}`).join("\n"),
    files: [...current].sort(),
  };
}
