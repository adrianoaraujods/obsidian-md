/**
 * Plan the `meta.json` side of a Reorganize (ADR 0017): reorder, Separators,
 * folder titles, and keeping `pages` in sync when items move or are renamed.
 *
 * Pure and browser-safe. It replays a list of changes against the Vault's
 * files and the text of its `meta.json` files, and returns the whole-file
 * writes (and deletes) that belong in the same commit. It does not move files:
 * the caller's planner does that and passes the same `move` changes here.
 */
import {
  addSeparator,
  createMeta,
  type Meta,
  type MetaEntry,
  moveEntry,
  readMeta,
  removeSeparator,
  renameSeparator,
  setTitle,
  writeMeta,
} from "./meta.js";

/** A page or folder that takes part in a folder's order. `name` has no extension. */
export interface OrderChild {
  name: string;
  folder: boolean;
}

/** A row of a folder's order, as the File Tree lists it. */
export type OrderRow =
  | { type: "item"; name: string; folder: boolean }
  | { type: "separator"; title: string };

/**
 * A change the plan replays. Row indexes count the rows `folderRows` returns,
 * as they stand after the changes before it.
 */
export type OrderChange =
  | { type: "move"; from: string; to: string }
  | { type: "reorder"; folder: string; from: number; to: number }
  | { type: "add-separator"; folder: string; title: string; index: number }
  | { type: "rename-separator"; folder: string; index: number; title: string }
  | { type: "remove-separator"; folder: string; index: number }
  | { type: "set-title"; folder: string; title: string | undefined };

export interface MetaPlanInput {
  /** Vault-relative path of every file (Notes, Assets and `meta.json` files). */
  files: readonly string[];
  /** The text of each folder's `meta.json`, keyed by folder path (`""` is the root). */
  metas: Readonly<Record<string, string>>;
  changes: readonly OrderChange[];
}

export type MetaPlan =
  | {
      ok: true;
      /** Whole-file writes, at the paths the files have once the moves are applied. */
      writes: { path: string; content: string }[];
      /** `meta.json` files of folders that no longer hold anything. */
      deletes: string[];
      /** The text of every `meta.json` the Vault ends up with, by folder. */
      texts: Record<string, string>;
      /** The folders' `meta` once the changes are applied (those that have one). */
      metas: Record<string, Meta>;
    }
  | { ok: false; error: string; index: number };

const NOTE = /\.md$/i;
const META = /(^|\/)meta\.json$/;

function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function join(folder: string, name: string): string {
  return folder === "" ? name : `${folder}/${name}`;
}

function stem(name: string): string {
  return name.replace(NOTE, "");
}

/** Folders first, then pages, each by name: the order a folder without `pages` has. */
export function defaultOrder(children: readonly OrderChild[]): OrderChild[] {
  return [...children].sort(
    (a, b) =>
      (a.folder === b.folder ? 0 : a.folder ? -1 : 1) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * The pages and folders directly in `folder` that take part in its order: Notes,
 * and folders that hold a Note somewhere below. Assets do not.
 */
export function orderChildren(
  files: readonly string[],
  folder: string,
): OrderChild[] {
  const prefix = folder === "" ? "" : `${folder}/`;
  const found = new Map<string, OrderChild>();
  for (const path of files) {
    if (!path.startsWith(prefix) || META.test(path) || !NOTE.test(path))
      continue;
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash < 0) found.set(`f:${rest}`, { name: stem(rest), folder: false });
    else {
      const name = rest.slice(0, slash);
      found.set(`d:${name}`, { name, folder: true });
    }
  }
  return defaultOrder([...found.values()]);
}

type Row = OrderRow & { entry?: number };

function rowsOf(
  meta: Meta | undefined,
  children: readonly OrderChild[],
): Row[] {
  const byName = new Map(children.map((c) => [c.name, c]));
  if (!meta) {
    return defaultOrder(children).map((c) => ({ type: "item", ...c }));
  }
  const listed = new Set<string>();
  for (const entry of meta.entries)
    if (entry.type === "item") listed.add(entry.name);
  const rest = defaultOrder(children.filter((c) => !listed.has(c.name)));
  const rows: Row[] = [];
  let placed = false;
  const placeRest = (entry?: number) => {
    placed = true;
    for (const c of rest)
      rows.push({
        type: "item",
        ...c,
        ...(entry === undefined ? {} : { entry }),
      });
  };
  for (const [entry, e] of meta.entries.entries()) {
    if (e.type === "item") {
      const child = byName.get(e.name);
      if (child) rows.push({ type: "item", ...child, entry });
    } else if (e.type === "separator") {
      rows.push({ type: "separator", title: e.title, entry });
    } else if (e.value === "..." && !placed) {
      placeRest();
    }
  }
  // Without a '...' the File Tree hides what `pages` does not name; the
  // Manager still shows it, last, so it can be moved.
  if (!placed) placeRest();
  return rows;
}

/**
 * The rows of a folder's order: the `meta` entries in sequence, with the items
 * a `...` stands for (or that `pages` leaves out) listed where `...` is, or last.
 */
export function folderRows(
  meta: Meta | undefined,
  children: readonly OrderChild[],
): OrderRow[] {
  return rowsOf(meta, children).map(({ entry: _entry, ...row }) => row);
}

/** Writes every row as an explicit entry, so the rows can be placed one by one. */
function materialize(
  meta: Meta | undefined,
  children: readonly OrderChild[],
): Meta {
  if (!meta) return createMeta(defaultOrder(children).map((c) => c.name));
  const listed = new Set<string>();
  for (const entry of meta.entries)
    if (entry.type === "item") listed.add(entry.name);
  const rest = defaultOrder(children.filter((c) => !listed.has(c.name)));
  const items = rest.map((c): MetaEntry => ({ type: "item", name: c.name }));
  const dots = meta.entries.findIndex(
    (e) => e.type === "other" && e.value === "...",
  );
  if (rest.length === 0) return meta;
  const entries = [...meta.entries];
  entries.splice(dots < 0 ? entries.length : dots, 0, ...items);
  return { ...meta, entries };
}

class PlanError extends Error {}

/** Replay `changes` and return the `meta.json` writes they need, or the first failure. */
export function planMeta(input: MetaPlanInput): MetaPlan {
  let files = new Set(input.files);
  // Working `meta` by folder, the original text it came from, and which changed.
  let metas = new Map<string, Meta>();
  let originals = new Map<string, string>();
  const touched = new Set<string>();
  for (const [folder, text] of Object.entries(input.metas))
    originals.set(folder, text);

  const metaOf = (folder: string): Meta | undefined => {
    const known = metas.get(folder);
    if (known) return known;
    const text = originals.get(folder);
    if (text === undefined) return undefined;
    try {
      const parsed = readMeta(text);
      metas.set(folder, parsed);
      return parsed;
    } catch {
      throw new PlanError(`${join(folder, "meta.json")} is not valid JSON.`);
    }
  };
  const update = (folder: string, meta: Meta) => {
    metas.set(folder, meta);
    touched.add(folder);
  };
  const rowsAt = (folder: string, index: number) => {
    const children = orderChildren([...files], folder);
    if (children.length === 0)
      throw new PlanError(
        `"${folder || "The Vault root"}" has nothing to order.`,
      );
    return { children, rows: rowsOf(metaOf(folder), children), index };
  };
  const entryOf = (rows: Row[], index: number): number => {
    const entry = rows[index]?.entry;
    if (entry === undefined) throw new PlanError(`There is no row ${index}.`);
    return entry;
  };

  const removeItem = (folder: string, name: string) => {
    const meta = metaOf(folder);
    if (!meta) return;
    const at = meta.entries.findIndex(
      (e) => e.type === "item" && e.name === name,
    );
    if (at < 0) return;
    update(folder, {
      ...meta,
      entries: meta.entries.filter((_, i) => i !== at),
    });
  };
  const addItem = (folder: string, name: string) => {
    const meta = metaOf(folder);
    if (!meta) return;
    const listsRest = meta.entries.some(
      (e) => e.type === "other" && e.value === "...",
    );
    const listed = meta.entries.some(
      (e) => e.type === "item" && e.name === name,
    );
    if (listsRest || listed) return;
    update(folder, {
      ...meta,
      entries: [...meta.entries, { type: "item", name }],
    });
  };
  const hasNotes = (folder: string) =>
    orderChildren([...files], folder).length > 0;

  const move = (from: string, to: string) => {
    const inside = [...files].filter((p) => p.startsWith(`${from}/`));
    const isFolder = !files.has(from) && inside.length > 0;
    if (!files.has(from) && !isFolder)
      throw new PlanError(`"${from}" is not in the Vault.`);
    const ordered = isFolder
      ? inside.some((p) => NOTE.test(p))
      : NOTE.test(from);
    const name = (path: string) =>
      isFolder ? basename(path) : stem(basename(path));

    // Folders that may start or stop holding a Note.
    const chain = new Set<string>();
    for (const start of [dirname(from), dirname(to)])
      for (let d = start; d !== ""; d = dirname(d)) chain.add(d);
    const before = new Map([...chain].map((d) => [d, hasNotes(d)]));

    const next = new Set(files);
    const pairs: [string, string][] = isFolder
      ? inside.map((p) => [p, `${to}${p.slice(from.length)}`])
      : [[from, to]];
    for (const [oldPath] of pairs) next.delete(oldPath);
    for (const [, newPath] of pairs) next.add(newPath);
    files = next;
    if (isFolder) {
      const rekey = <T>(map: Map<string, T>) =>
        new Map(
          [...map].map(([k, v]) => [
            k === from || k.startsWith(`${from}/`)
              ? to + k.slice(from.length)
              : k,
            v,
          ]),
        );
      metas = rekey(metas);
      originals = rekey(originals);
      const moved = new Set(
        [...touched].map((k) =>
          k === from || k.startsWith(`${from}/`)
            ? to + k.slice(from.length)
            : k,
        ),
      );
      touched.clear();
      for (const k of moved) touched.add(k);
    }

    if (ordered) {
      if (dirname(from) === dirname(to)) {
        const folder = dirname(from);
        const meta = metaOf(folder);
        const old = name(from);
        const at = meta?.entries.findIndex(
          (e) => e.type === "item" && e.name === old,
        );
        if (meta && at !== undefined && at >= 0) {
          const entries = [...meta.entries];
          entries[at] = { type: "item", name: name(to) };
          update(folder, { ...meta, entries });
        }
      } else {
        removeItem(dirname(from), name(from));
        addItem(dirname(to), name(to));
      }
    }
    for (const d of chain) {
      const now = hasNotes(d);
      if (before.get(d) && !now) removeItem(dirname(d), basename(d));
      else if (!before.get(d) && now) addItem(dirname(d), basename(d));
    }
  };

  const changes = input.changes;
  for (const [index, change] of changes.entries()) {
    try {
      switch (change.type) {
        case "move":
          move(change.from, change.to);
          break;
        case "set-title": {
          const meta = metaOf(change.folder) ?? { entries: [] };
          update(change.folder, setTitle(meta, change.title));
          break;
        }
        case "reorder": {
          const { children, rows } = rowsAt(change.folder, change.from);
          if (!rows[change.from] || !rows[change.to])
            throw new PlanError("That row is not there.");
          const meta = materialize(metaOf(change.folder), children);
          const explicit = rowsOf(meta, children);
          update(
            change.folder,
            moveEntry(
              meta,
              entryOf(explicit, change.from),
              entryOf(explicit, change.to),
            ),
          );
          break;
        }
        case "add-separator": {
          const { children, rows } = rowsAt(change.folder, change.index);
          if (change.index > rows.length)
            throw new PlanError("That row is not there.");
          const meta = materialize(metaOf(change.folder), children);
          const explicit = rowsOf(meta, children);
          const last = explicit.at(-1)?.entry;
          const at =
            change.index < explicit.length
              ? entryOf(explicit, change.index)
              : last === undefined
                ? 0
                : last + 1;
          update(change.folder, addSeparator(meta, change.title, at));
          break;
        }
        case "rename-separator":
        case "remove-separator": {
          const { rows } = rowsAt(change.folder, change.index);
          const row = rows[change.index];
          if (row?.type !== "separator" || row.entry === undefined)
            throw new PlanError("That row is not a Separator.");
          const meta = metaOf(change.folder) as Meta;
          update(
            change.folder,
            change.type === "rename-separator"
              ? renameSeparator(meta, row.entry, change.title)
              : removeSeparator(meta, row.entry),
          );
          break;
        }
      }
    } catch (error) {
      if (error instanceof PlanError)
        return { ok: false, error: error.message, index };
      throw error;
    }
  }

  const writes: { path: string; content: string }[] = [];
  const deletes: string[] = [];
  const result: Record<string, Meta> = {};
  const texts: Record<string, string> = {};
  const folders = new Set([...metas.keys(), ...originals.keys()]);
  for (const folder of folders) {
    const meta = metaOf(folder);
    if (!meta) continue;
    result[folder] = meta;
    const path = join(folder, "meta.json");
    const empty = ![...files].some(
      (p) => !META.test(p) && (folder === "" || p.startsWith(`${folder}/`)),
    );
    if (empty && folder !== "") {
      if (originals.has(folder)) deletes.push(path);
      delete result[folder];
      continue;
    }
    const original = originals.get(folder);
    const content = touched.has(folder) ? writeMeta(original, meta) : original;
    if (content === undefined) continue;
    texts[folder] = content;
    if (content !== original) writes.push({ path, content });
  }
  return { ok: true, writes, deletes, texts, metas: result };
}
