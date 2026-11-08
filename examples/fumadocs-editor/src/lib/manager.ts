import {
  checkSegments,
  planReorganization,
  type ReorganizationPlan,
  type StagedChange,
} from "codemirror-obsidian-md/manager";
import type { Changeset } from "codemirror-obsidian-md/storage";
import {
  type Meta,
  type OrderChange,
  planMeta,
} from "fumadocs-obsidian-md/meta";

export type TreeNode =
  | { kind: "file"; name: string; path: string }
  | { kind: "folder"; name: string; path: string; children: TreeNode[] };

/**
 * The Vault's files as nested folders: folders first, then files, each by name.
 * `extraFolders` are staged folders that hold nothing yet; they are shown
 * but exist in the Vault only once something is moved into them.
 */
export function buildTree(
  files: readonly string[],
  extraFolders: readonly string[] = [],
): TreeNode[] {
  const root: TreeNode[] = [];
  const entries = [
    ...files.map((path) => ({ path, folder: false })),
    ...extraFolders.map((path) => ({ path, folder: true })),
  ];
  for (const { path: file, folder: isFolder } of entries) {
    const parts = file.split("/");
    let level = root;
    for (let i = 0; i < parts.length - (isFolder ? 0 : 1); i++) {
      const path = parts.slice(0, i + 1).join("/");
      let folder = level.find(
        (n): n is Extract<TreeNode, { kind: "folder" }> =>
          n.kind === "folder" && n.path === path,
      );
      if (!folder) {
        folder = { kind: "folder", name: parts[i] ?? "", path, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
    if (!isFolder)
      level.push({ kind: "file", name: parts.at(-1) ?? "", path: file });
  }
  const order = (nodes: TreeNode[]) => {
    nodes.sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1) ||
        a.name
          .replace(/\.md$/i, "")
          .localeCompare(b.name.replace(/\.md$/i, "")),
    );
    for (const node of nodes) if (node.kind === "folder") order(node.children);
  };
  order(root);
  return root;
}

/** The trailer the open Example adds; the authenticated Example adds `Edited-by` too (ADR 0015). */
export const TRAILER = "Edited-with: obsidian-md editor";

export function commitMessage(plan: { subject: string; body: string }) {
  return `${plan.subject}\n\n${plan.body}\n\n${TRAILER}`;
}

export interface CommitRequest {
  base: string;
  changeset: Changeset;
}

/** Validate a request body for the commit route: renames, whole-file writes and deletes, with a base. */
export function parseCommitRequest(body: unknown): CommitRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { base, changeset } = body as Record<string, unknown>;
  if (typeof base !== "string" || !Array.isArray(changeset)) return null;
  const parsed: Changeset = [];
  for (const change of changeset) {
    if (typeof change !== "object" || change === null) return null;
    if (
      change.type === "rename" &&
      typeof change.from === "string" &&
      typeof change.to === "string"
    ) {
      parsed.push({ type: "rename", from: change.from, to: change.to });
    } else if (
      change.type === "write" &&
      typeof change.path === "string" &&
      typeof change.content === "string" &&
      checkSegments(change.path, "path") === null
    ) {
      parsed.push({
        type: "write",
        path: change.path,
        content: change.content,
      });
    } else if (
      change.type === "delete" &&
      typeof change.path === "string" &&
      checkSegments(change.path, "path") === null
    ) {
      parsed.push({ type: "delete", path: change.path });
    } else return null;
  }
  return { base, changeset: parsed };
}

/** A change the user stages: a move or rename, or an edit of a folder's `meta.json`. */
export type ManagerChange = OrderChange;

const META = /(^|\/)meta\.json$/;

function where(folder: string): string {
  return folder === "" ? "the Vault root" : folder;
}

function folderOf(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

/** One line for a staged change, for the pending list and the commit body. */
export function describeChange(change: ManagerChange): string {
  switch (change.type) {
    case "move":
      return `${folderOf(change.from) === folderOf(change.to) ? "Rename" : "Move"} ${change.from} → ${change.to}`;
    case "reorder":
      return `Reorder items in ${where(change.folder)}`;
    case "add-separator":
      return `Add Separator "${change.title}" in ${where(change.folder)}`;
    case "rename-separator":
      return `Rename Separator to "${change.title}" in ${where(change.folder)}`;
    case "remove-separator":
      return `Remove Separator in ${where(change.folder)}`;
    case "set-title":
      return change.title === undefined
        ? `Clear the title of ${where(change.folder)}`
        : `Set the title of ${where(change.folder)} to "${change.title}"`;
  }
}

export interface ManagerPlanInput {
  /** Notes and Assets, without `meta.json` files. */
  files: readonly string[];
  /** The text of each folder's `meta.json`, keyed by folder (`""` is the root). */
  metas: Readonly<Record<string, string>>;
  notes: Readonly<Record<string, string>>;
  changes: readonly ManagerChange[];
  urlPrefix?: string;
}

export type ManagerPlan =
  | (Extract<ReorganizationPlan, { ok: true }> & {
      /** The folders' `meta` once the changes are applied. */
      metas: Record<string, Meta>;
      /** The text of every `meta.json` the Vault ends up with, by folder. */
      metaTexts: Record<string, string>;
    })
  | { ok: false; error: string; index: number };

/**
 * Turn the staged changes into the one changeset that commits them: the moves,
 * the link rewrites they need, and the `meta.json` writes (reorder, Separators,
 * titles, and `pages` kept in sync with moves). Pure.
 */
export function planManager(input: ManagerPlanInput): ManagerPlan {
  const metaFiles = Object.keys(input.metas).map((folder) =>
    folder === "" ? "meta.json" : `${folder}/meta.json`,
  );
  const all = [...input.files, ...metaFiles];

  const moves: StagedChange[] = [];
  const moveAt: number[] = [];
  for (const [index, change] of input.changes.entries()) {
    if (change.type !== "move") continue;
    moves.push(change);
    moveAt.push(index);
  }
  const base = planReorganization({
    files: all,
    changes: moves,
    notes: input.notes,
    ...(input.urlPrefix === undefined ? {} : { urlPrefix: input.urlPrefix }),
  });
  if (!base.ok)
    return {
      ...base,
      index: moveAt[base.index] ?? Math.max(0, input.changes.length - 1),
    };
  const meta = planMeta({
    files: all,
    metas: input.metas,
    changes: input.changes,
  });
  if (!meta.ok) return meta;

  const orderChanges = input.changes.filter(
    (c): c is Exclude<ManagerChange, { type: "move" }> => c.type !== "move",
  );
  const ordered = new Set(orderChanges.map((c) => c.folder));
  const count = base.items.length + orderChanges.length;
  const subject =
    orderChanges.length === 0
      ? base.subject
      : `Reorganize ${count} ${count === 1 ? "item" : "items"}`;
  const body = [
    ...base.items.map((m) => `- ${m.kind} ${m.from} → ${m.to}`),
    ...orderChanges.map((c) => `- ${describeChange(c)}`),
    ...base.rewrites.map((r) => `- Update ${r.links} link(s) in ${r.path}`),
    // A write already explained by an order change is not listed twice.
    ...meta.writes
      .filter((w) => !ordered.has(folderOf(w.path)))
      .map((w) => `- Update ${w.path}`),
    ...meta.deletes.map((p) => `- Remove ${p}`),
  ].join("\n");

  return {
    ...base,
    subject,
    body,
    changeset: [
      ...base.changeset,
      ...meta.writes.map(
        (w) => ({ type: "write", path: w.path, content: w.content }) as const,
      ),
      ...meta.deletes.map((path) => ({ type: "delete", path }) as const),
    ],
    files: base.files.filter((path) => !META.test(path)),
    metas: meta.metas,
    metaTexts: meta.texts,
  };
}
