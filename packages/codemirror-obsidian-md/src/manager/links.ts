import type { Nodes, Parent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  mapResolver,
  type Resolver,
  remarkObsidianMd,
  splitFrontmatter,
} from "remark-obsidian-md/syntax";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * Link rewriting for a reorganization (ADR 0017). Every link of a Note is
 * resolved against the Vault before and after the moves with the remark
 * plugin's resolver; only links whose target changes are edited, keeping the
 * author's Alias, Subpath and path style.
 */

/** The Vault at one moment: what resolves, and which files exist. */
export interface World {
  resolver: Resolver;
  has(path: string): boolean;
}

/** Orders paths the way a directory walk visits them, so ties between equal names are stable. */
function walkOrder(a: string, b: string): number {
  const x = a.split("/");
  const y = b.split("/");
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const c = (x[i] ?? "").localeCompare(y[i] ?? "");
    if (c !== 0) return c;
  }
  return x.length - y.length;
}

function aliasesOf(content: string | undefined): string[] {
  if (content === undefined) return [];
  const { aliases } = splitFrontmatter(content).frontmatter;
  if (typeof aliases === "string") return [aliases];
  return Array.isArray(aliases)
    ? aliases.filter((a): a is string => typeof a === "string")
    : [];
}

/** Build the resolver of a Vault from its files; `aliases` gives a Note's Aliases by path. */
export function buildWorld(
  files: readonly string[],
  aliases: (path: string) => string[],
): World {
  const sorted = [...files].sort(walkOrder);
  const resolver = mapResolver(
    Object.fromEntries(
      sorted.map((path) => [path, { path, aliases: aliases(path) }]),
    ),
  );
  const set = new Set(files);
  return { resolver, has: (path) => set.has(path) };
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface Context {
  before: World;
  after: World;
  /** Where each moved file ends up, by where it was. */
  moved: ReadonlyMap<string, string>;
  /** The Note being edited: its path before and after the moves. */
  from: string;
  to: string;
}

const folderOf = (path: string) =>
  path.slice(0, Math.max(0, path.lastIndexOf("/")));
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const RELATIVE = /^\.{1,2}\//;

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function relativeTo(folder: string, path: string): string {
  const from = folder === "" ? [] : folder.split("/");
  const to = path.split("/");
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...from.slice(i).map(() => ".."), ...to.slice(i)].join("/");
}

/** The file `text` names when written in the Note at `source`, or `null`. */
function resolvePath(
  world: World,
  text: string,
  source: string,
  relative: boolean,
): string | null {
  if (relative && RELATIVE.test(text)) {
    const joined = normalize(`${folderOf(source)}/${text}`);
    for (const candidate of [joined, `${joined}.md`])
      if (world.has(candidate)) return candidate;
    return null;
  }
  const resolved = world.resolver.resolve(text);
  return resolved.exists ? resolved.path.replace(/^\//, "") : null;
}

/**
 * The text that keeps `text` pointing at the same file after the moves, or
 * `null` when it already does. `relative` allows `./` and `../` paths
 * (Markdown links only).
 */
function retarget(
  text: string,
  ctx: Context,
  relative: boolean,
): string | null {
  const old = resolvePath(ctx.before, text, ctx.from, relative);
  if (old === null) return null;
  const expected = ctx.moved.get(old) ?? old;
  if (resolvePath(ctx.after, text, ctx.to, relative) === expected) return null;

  const isNote = /\.md$/i.test(expected);
  const keepExtension = !isNote || /\.md$/i.test(text);
  const spell = (path: string) =>
    keepExtension ? path : path.replace(/\.md$/i, "");

  if (relative && RELATIVE.test(text)) {
    const path = spell(relativeTo(folderOf(ctx.to), expected));
    return text.startsWith("./") && !path.startsWith("../")
      ? `./${path}`
      : path;
  }
  const lead = text.startsWith("/") ? "/" : "";
  if (lead === "" && !text.includes("/")) {
    const bare = spell(nameOf(expected));
    if (resolvePath(ctx.after, bare, ctx.to, false) === expected) return bare;
  }
  return lead + spell(expected);
}

const WIKI = /(!?)\[\[([^\n]*?)\]\]/g;

/** Edit the Link Target of one Wiki Link or Embed, given where its inner text starts. */
function wikiEdit(
  inner: string,
  innerStart: number,
  ctx: Context,
): Edit | null {
  let end = inner.search(/[#|]/);
  if (end < 0) end = inner.length;
  else if (inner[end] === "|" && inner[end - 1] === "\\") end -= 1;
  const raw = inner.slice(0, end);
  const text = raw.trim().replace(/\\/g, "/");
  if (text === "") return null;
  const next = retarget(text, ctx, false);
  if (next === null) return null;
  const lead = raw.length - raw.trimStart().length;
  return {
    start: innerStart + lead,
    end: innerStart + lead + raw.trim().length,
    text: next,
  };
}

/** Where the destination of a link, image or definition sits in the source. */
function destination(
  source: string,
  node: Nodes,
): { start: number; end: number; angle: boolean } | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return null;
  let p: number;
  if (node.type === "definition") {
    const colon = source.indexOf("]:", start);
    if (colon < 0 || colon >= end) return null;
    p = colon + 2;
  } else {
    const kids = (node as Parent).children;
    const last = kids?.at(-1)?.position?.end.offset;
    const open = source.indexOf(
      "](",
      last ?? start + (node.type === "image" ? 2 : 1),
    );
    if (open < 0 || open >= end) return null;
    p = open + 2;
  }
  while (/\s/.test(source[p] ?? "")) p++;
  if (source[p] === "<") {
    const close = source.indexOf(">", p);
    return close < 0 || close > end
      ? null
      : { start: p + 1, end: close, angle: true };
  }
  let depth = 0;
  let q = p;
  for (; q < end; q++) {
    const c = source[q];
    if (c === "\\") q++;
    else if (c === "(") depth++;
    else if (c === ")") {
      if (depth === 0) break;
      depth--;
    } else if (c !== undefined && /\s/.test(c)) break;
  }
  return { start: p, end: q, angle: false };
}

function encodeDestination(
  path: string,
  encoded: boolean,
  angle: boolean,
): string {
  if (angle) return path;
  if (encoded) return path.split("/").map(encodeURIComponent).join("/");
  return path.replace(/[ %()<>]/g, (c) => encodeURIComponent(c));
}

const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#|$)/i;

function markdownEdit(source: string, node: Nodes, ctx: Context): Edit | null {
  const place = destination(source, node);
  if (!place) return null;
  const raw = source.slice(place.start, place.end);
  const hash = raw.indexOf("#");
  const pathPart = hash < 0 ? raw : raw.slice(0, hash);
  if (EXTERNAL.test(pathPart || "#")) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    return null;
  }
  const next = retarget(decoded, ctx, true);
  if (next === null) return null;
  return {
    start: place.start,
    end: place.start + pathPart.length,
    text: encodeDestination(next, decoded !== pathPart, place.angle),
  };
}

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkObsidianMd);

function walk(node: Nodes, visit: (node: Nodes) => void): void {
  visit(node);
  for (const child of (node as Parent).children ?? []) walk(child, visit);
}

/** The Note's text with its links fixed, and how many were edited. */
export function rewriteNote(
  source: string,
  ctx: Context,
): { content: string; links: number } {
  const edits: Edit[] = [];
  const { body } = splitFrontmatter(source);
  const bodyStart = source.length - body.length;

  // Frontmatter links are Wiki Links inside the YAML text.
  for (const match of source.slice(0, bodyStart).matchAll(WIKI)) {
    const edit = wikiEdit(
      match[2] ?? "",
      (match.index ?? 0) + (match[1] ?? "").length + 2,
      ctx,
    );
    if (edit) edits.push(edit);
  }

  let tree: Nodes | null = null;
  try {
    tree = parser.parse(body);
  } catch {
    tree = null;
  }
  if (tree) {
    walk(tree, (node) => {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) return;
      if (node.type === "wikiLink" || node.type === "embed") {
        const prefix = node.type === "embed" ? 3 : 2;
        const raw = body.slice(start, end);
        const edit = wikiEdit(
          raw.slice(prefix, -2),
          bodyStart + start + prefix,
          ctx,
        );
        if (edit) edits.push(edit);
      } else if (
        node.type === "link" ||
        node.type === "image" ||
        node.type === "definition"
      ) {
        const edit = markdownEdit(body, node, ctx);
        if (edit)
          edits.push({
            ...edit,
            start: edit.start + bodyStart,
            end: edit.end + bodyStart,
          });
      }
    });
  }

  let content = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    content =
      content.slice(0, edit.start) + edit.text + content.slice(edit.end);
  return { content, links: edits.length };
}

export type { Context as RewriteContext };
export { aliasesOf };
