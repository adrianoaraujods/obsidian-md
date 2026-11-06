import {
  EditorState,
  type Extension,
  Facet,
  Prec,
  type Range,
  RangeSet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

import { isRevealed } from "./cursor.js";
import { createNoteParser } from "./parse.js";
import type {
  Construct,
  ConstructProvider,
  NoteParser,
  ProviderResult,
} from "./types.js";

export interface ObsidianMdOptions {
  /** Per-construct decoration providers (Live Preview). Default: none. */
  providers?: readonly ConstructProvider[];
  /** Idle time in ms before a re-parse after typing stops. Default 250. */
  idleMs?: number;
  /** Replaces the default plugin-backed parser. */
  parser?: NoteParser;
}

export const DEFAULT_IDLE_MS = 250;

/**
 * Register a provider from any extension: `constructProviders.of(provider)`.
 * Every registered provider runs for the constructs of its `types`.
 */
export const constructProviders = Facet.define<
  ConstructProvider,
  readonly ConstructProvider[]
>({ combine: (values) => values });

const parserFacet = Facet.define<NoteParser, NoteParser>({
  combine: (values) => values[0] ?? createNoteParser(),
});

const idleFacet = Facet.define<number, number>({
  combine: (values) => values[0] ?? DEFAULT_IDLE_MS,
});

/** Carries a fresh parse result, for the doc it was parsed from. */
const parsed = StateEffect.define<readonly Construct[]>();

/** The parsed constructs, mapped through edits between re-parses. */
export const constructsField = StateField.define<readonly Construct[]>({
  create: (state) => state.facet(parserFacet)(state.doc.toString()),
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(parsed)) return effect.value;
    if (!tr.docChanged) return value;
    return value.map((c) => ({
      ...c,
      from: tr.changes.mapPos(c.from, 1),
      to: tr.changes.mapPos(c.to, -1),
    }));
  },
});

function buildDecorations(state: EditorState): DecorationSet {
  const providers = state.facet(constructProviders);
  if (providers.length === 0) return Decoration.none;
  const byType = new Map<string, ConstructProvider[]>();
  for (const p of providers) {
    for (const type of p.types) {
      const list = byType.get(type) ?? [];
      list.push(p);
      byType.set(type, list);
    }
  }
  const ranges: Range<Decoration>[] = [];
  for (const construct of state.field(constructsField)) {
    const list = byType.get(construct.type);
    if (!list || construct.to < construct.from) continue;
    const context = {
      state,
      revealed: isRevealed(state, construct.from, construct.to),
    };
    for (const p of list) {
      const result: ProviderResult = p.decorate(construct, context);
      if (!result) continue;
      if (Array.isArray(result)) ranges.push(...result);
      else ranges.push(result as Range<Decoration>);
    }
  }
  return RangeSet.of(ranges, true);
}

/**
 * Decorations are rebuilt when a re-parse lands or the selection moves (so
 * the cursor reveal follows it), and only mapped while the user types.
 */
export const decorationsField = StateField.define<DecorationSet>({
  create: buildDecorations,
  update(value, tr) {
    const reparsed = tr.effects.some((e) => e.is(parsed));
    if (reparsed || (tr.selection && !tr.docChanged)) {
      return buildDecorations(tr.state);
    }
    return tr.docChanged ? value.map(tr.changes) : value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Re-parses the whole Note now, replacing the constructs. */
export function reparse(view: EditorView): void {
  const constructs = view.state.facet(parserFacet)(view.state.doc.toString());
  view.dispatch({ effects: parsed.of(constructs) });
}

/** Debounces re-parsing to idle: each edit restarts the timer. */
const scheduler = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | undefined;
    constructor(readonly view: EditorView) {}
    update(update: ViewUpdate) {
      if (!update.docChanged) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        reparse(this.view);
      }, update.state.facet(idleFacet));
    }
    destroy() {
      clearTimeout(this.timer);
    }
  },
);

/**
 * True when every line break of the Note is CRLF. The document always uses
 * `\n` as its separator so a `\r` stays a plain character and document
 * positions equal text offsets (the parser reports offsets); this only decides
 * whether Enter should insert `\r\n` to keep the Note consistent.
 */
export function isCrlf(text: string): boolean {
  const lf = text.match(/\n/g)?.length ?? 0;
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  return lf > 0 && lf === crlf;
}

const insertCrlfNewline = (view: EditorView): boolean => {
  view.dispatch(view.state.replaceSelection("\r\n"), {
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

/**
 * The core extension: line-separator preservation, the debounced parse
 * pipeline and the decoration providers. Compose it with your own extensions.
 */
export function obsidianMd(
  doc: string,
  options: ObsidianMdOptions = {},
): Extension {
  return [
    EditorState.lineSeparator.of("\n"),
    isCrlf(doc)
      ? Prec.high(keymap.of([{ key: "Enter", run: insertCrlfNewline }]))
      : [],
    idleFacet.of(options.idleMs ?? DEFAULT_IDLE_MS),
    options.parser ? parserFacet.of(options.parser) : [],
    (options.providers ?? []).map((p) => constructProviders.of(p)),
    constructsField,
    decorationsField,
    scheduler,
  ];
}
