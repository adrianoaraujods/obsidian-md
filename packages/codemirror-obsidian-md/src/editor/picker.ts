import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Resolver } from "remark-obsidian-md";

/** A Note the host offers in the picker. */
export interface NoteCandidate {
  /** Vault path, e.g. `Projects/Roadmap.md`. */
  path: string;
  /** Display name. Default: the file name without its extension. */
  title?: string;
  /** Alias names the Note can also be found by. */
  aliases?: readonly string[];
}

export interface PickerOptions {
  /** The Vault's Notes, or a getter read on every open so props can change. */
  candidates: readonly NoteCandidate[] | (() => readonly NoteCandidate[]);
  /**
   * Decides which target reaches a Note, so the inserted link resolves the
   * same as on the Wiki (ADR 0003). Default: the bare name unless another
   * candidate shares it, else the path.
   */
  resolver?: Resolver;
  /** Maximum options shown. Default 100. */
  maxResults?: number;
}

const stripExt = (s: string) => s.replace(/\.mdx?$/i, "");
const normalize = (s: string) => stripExt(s).replace(/^\/+/, "").toLowerCase();
const baseName = (path: string) => stripExt(path.split("/").pop() ?? path);
const titleOf = (c: NoteCandidate) => c.title ?? baseName(c.path);

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length;
}

/** Lower is better; undefined means no match. */
function score(name: string, query: string, base: number): number | undefined {
  const n = name.toLowerCase();
  if (n === query) return base;
  if (n.startsWith(query)) return base + 1;
  if (n.split(/[\s\-_/.]+/).some((w) => w.startsWith(query))) return base + 2;
  if (n.includes(query)) return base + 3;
  return undefined;
}

interface Match {
  candidate: NoteCandidate;
  /** Set when an Alias matched better than the title. */
  alias?: string;
  rank: number;
}

function match(candidate: NoteCandidate, query: string): Match | undefined {
  if (!query) return { candidate, rank: 0 };
  let best: Match | undefined;
  const offer = (rank: number | undefined, alias?: string) => {
    if (rank === undefined || (best && best.rank <= rank)) return;
    best =
      alias === undefined ? { candidate, rank } : { candidate, rank, alias };
  };
  offer(score(titleOf(candidate), query, 0));
  for (const alias of candidate.aliases ?? []) {
    offer(score(alias, query, 10), alias);
  }
  offer(score(stripExt(candidate.path), query, 20));
  if (!best && isSubsequence(query, titleOf(candidate).toLowerCase())) {
    offer(30);
  }
  return best;
}

const byPath = (a: Match, b: Match) =>
  a.candidate.path < b.candidate.path
    ? -1
    : a.candidate.path > b.candidate.path
      ? 1
      : 0;

function rankMatches(
  candidates: readonly NoteCandidate[],
  rawQuery: string,
): Match[] {
  const query = rawQuery.trim().toLowerCase();
  const matches: Match[] = [];
  for (const c of candidates) {
    const m = match(c, query);
    if (m) matches.push(m);
  }
  return matches.sort(
    (a, b) =>
      a.rank - b.rank ||
      (query ? titleOf(a.candidate).length - titleOf(b.candidate).length : 0) ||
      byPath(a, b),
  );
}

/**
 * Ranks Notes by the typed text: exact title, title prefix, word start,
 * substring, Alias, path, then subsequence. Ties: shorter title, then path.
 * An empty query returns every candidate by path.
 */
export function rankCandidates(
  candidates: readonly NoteCandidate[],
  query: string,
): NoteCandidate[] {
  return rankMatches(candidates, query).map((m) => m.candidate);
}

/**
 * The Wiki Link target that reaches `candidate`: the bare name when it
 * resolves to the Note, otherwise the path (both without `.md`).
 */
export function wikiLinkTarget(
  candidate: NoteCandidate,
  all: readonly NoteCandidate[],
  resolver?: Resolver,
): string {
  const bare = baseName(candidate.path);
  const full = stripExt(candidate.path).replace(/^\/+/, "");
  if (resolver) {
    const r = resolver.resolve(bare);
    const ok =
      r.exists &&
      r.kind === "note" &&
      normalize(r.path) === normalize(candidate.path);
    return ok ? bare : full;
  }
  const clash = all.some(
    (o) =>
      o !== candidate && baseName(o.path).toLowerCase() === bare.toLowerCase(),
  );
  return clash ? full : bare;
}

function apply(link: string) {
  return (view: EditorView, _c: Completion, from: number, to: number) => {
    const closed = view.state.sliceDoc(to, to + 2) === "]]";
    view.dispatch({
      changes: { from, to: closed ? to + 2 : to, insert: `${link}]]` },
      selection: { anchor: from + link.length + 2 },
      userEvent: "input.complete",
    });
  };
}

/**
 * The `[[` picker: typing `[[` opens a list of the host's Notes ranked by the
 * text typed after it; choosing one inserts a closed Wiki Link.
 */
export function pickerExtension(options: PickerOptions): Extension {
  const { resolver, maxResults = 100 } = options;
  const source = (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/\[\[[^\]\n|#^]*/);
    if (!before) return null;
    const from = before.from + 2;
    const all =
      typeof options.candidates === "function"
        ? options.candidates()
        : options.candidates;
    const query = context.state.sliceDoc(from, context.pos);
    const completions: Completion[] = rankMatches(all, query)
      .slice(0, maxResults)
      .map(({ candidate, alias }) => {
        const target = wikiLinkTarget(candidate, all, resolver);
        const folder = candidate.path.includes("/")
          ? candidate.path.slice(0, candidate.path.lastIndexOf("/"))
          : undefined;
        const detail = alias !== undefined ? `alias ${alias}` : folder;
        return {
          label: titleOf(candidate),
          type: "text",
          apply: apply(alias === undefined ? target : `${target}|${alias}`),
          ...(detail !== undefined ? { detail } : {}),
        };
      });
    return { from, options: completions, filter: false };
  };
  return autocompletion({ override: [source], activateOnTypingDelay: 0 });
}
