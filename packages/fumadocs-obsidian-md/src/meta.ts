/**
 * Read and write a folder's Fumadocs `meta.json` (ADR 0017).
 *
 * Pure string-in, string-out and browser-safe: no Node imports, and no
 * knowledge of any editor. The module models only `title` and the order of
 * `pages`, with Separators written as `---Title---` entries. Every other key
 * and every `pages` entry it does not model (links, `...folder`, `!name`,
 * `z...a`, `...`) is kept in place.
 *
 * Syntax: https://www.fumadocs.dev/docs/headless/page-conventions
 */

/** A `pages` entry: a page or folder name, a Separator, or anything else. */
export type MetaEntry =
  | { type: "item"; name: string }
  | { type: "separator"; title: string }
  /** `...`, `...folder`, `!name`, `z...a`, links: preserved, never edited. */
  | { type: "other"; value: string };

export interface Meta {
  title?: string | undefined;
  entries: MetaEntry[];
}

const SEPARATOR = /^---(.+)---$/;
// Names Fumadocs treats as syntax rather than as a page or folder.
const SYNTAX = /^(\.\.\.|!|z\.\.\.a$|\[.*\]\(.*\)$|external:)/;

function parseEntry(value: string): MetaEntry {
  const separator = SEPARATOR.exec(value);
  if (separator) return { type: "separator", title: separator[1] as string };
  if (SYNTAX.test(value)) return { type: "other", value };
  return { type: "item", name: value };
}

function serializeEntry(entry: MetaEntry): string {
  if (entry.type === "item") return entry.name;
  if (entry.type === "separator") return `---${entry.title}---`;
  return entry.value;
}

function parseObject(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("meta.json must contain a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** Parses the text of a `meta.json`. Throws if it is not a JSON object. */
export function readMeta(text: string): Meta {
  const object = parseObject(text);
  const pages = Array.isArray(object.pages) ? object.pages : [];
  return {
    title: typeof object.title === "string" ? object.title : undefined,
    entries: pages.map((page) =>
      typeof page === "string"
        ? parseEntry(page)
        : // Not a string: not ours, keep it as it came.
          ({ type: "other", value: page } as unknown as MetaEntry),
    ),
  };
}

/**
 * Serializes `meta` over the existing file text (or `undefined` when the
 * folder has none), keeping every key it does not model, in place, and
 * writing two-space JSON with a trailing newline.
 */
export function writeMeta(existing: string | undefined, meta: Meta): string {
  const base = existing === undefined ? {} : parseObject(existing);
  const hadPages = "pages" in base;
  const out: Record<string, unknown> = {};
  if (meta.title !== undefined && !("title" in base)) out.title = meta.title;
  for (const [key, value] of Object.entries(base)) {
    if (key === "title") {
      if (meta.title !== undefined) out.title = meta.title;
    } else if (key === "pages") {
      out.pages = pagesOf(meta);
    } else {
      out[key] = value;
    }
  }
  if (!hadPages && meta.entries.length > 0) out.pages = pagesOf(meta);
  return `${JSON.stringify(out, null, 2)}\n`;
}

function pagesOf(meta: Meta): unknown[] {
  return meta.entries.map((entry) =>
    entry.type === "other" && typeof entry.value !== "string"
      ? entry.value
      : serializeEntry(entry),
  );
}

/**
 * The `meta` for a folder that has no `meta.json` yet: its current order,
 * ending with `"..."` so Notes created later still appear.
 */
export function createMeta(order: readonly string[]): Meta {
  return {
    entries: [
      ...order.map((name): MetaEntry => ({ type: "item", name })),
      { type: "other", value: "..." },
    ],
  };
}

/** Sets the folder's title, or clears it with `undefined`. */
export function setTitle(meta: Meta, title: string | undefined): Meta {
  return { ...meta, title };
}

/** Moves the entry at `from` so that it ends up at index `to`. */
export function moveEntry(meta: Meta, from: number, to: number): Meta {
  const entries = [...meta.entries];
  const [moved] = entries.splice(from, 1);
  if (moved === undefined) throw new RangeError(`No entry at index ${from}`);
  entries.splice(to, 0, moved);
  return { ...meta, entries };
}

/** Inserts a Separator so that it ends up at index `index`. */
export function addSeparator(meta: Meta, title: string, index: number): Meta {
  const entries = [...meta.entries];
  entries.splice(index, 0, { type: "separator", title });
  return { ...meta, entries };
}

function requireSeparator(meta: Meta, index: number): void {
  if (meta.entries[index]?.type !== "separator") {
    throw new Error(`Entry ${index} is not a Separator`);
  }
}

export function renameSeparator(
  meta: Meta,
  index: number,
  title: string,
): Meta {
  requireSeparator(meta, index);
  const entries = [...meta.entries];
  entries[index] = { type: "separator", title };
  return { ...meta, entries };
}

/** Removes a Separator; the items under it stay in the folder. */
export function removeSeparator(meta: Meta, index: number): Meta {
  requireSeparator(meta, index);
  return { ...meta, entries: meta.entries.filter((_, i) => i !== index) };
}

export * from "./meta-plan.js";
