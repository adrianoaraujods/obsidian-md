import type { Changeset } from "codemirror-obsidian-md/storage";

export type TreeNode =
  | { kind: "file"; name: string; path: string }
  | { kind: "folder"; name: string; path: string; children: TreeNode[] };

/** The Vault's files as nested folders: folders first, then files, each by name. */
export function buildTree(files: readonly string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.split("/");
    let level = root;
    for (let i = 0; i < parts.length - 1; i++) {
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
    level.push({ kind: "file", name: parts.at(-1) ?? "", path: file });
  }
  const order = (nodes: TreeNode[]) => {
    nodes.sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1) ||
        a.name.localeCompare(b.name),
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

/** Validate a request body for the commit route: renames only, with a base. */
export function parseCommitRequest(body: unknown): CommitRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { base, changeset } = body as Record<string, unknown>;
  if (typeof base !== "string" || !Array.isArray(changeset)) return null;
  const parsed: Changeset = [];
  for (const change of changeset) {
    if (
      typeof change !== "object" ||
      change === null ||
      change.type !== "rename" ||
      typeof change.from !== "string" ||
      typeof change.to !== "string"
    )
      return null;
    parsed.push({ type: "rename", from: change.from, to: change.to });
  }
  return { base, changeset: parsed };
}
