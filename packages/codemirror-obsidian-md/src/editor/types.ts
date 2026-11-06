import type { EditorState, Range } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import type { Nodes } from "mdast";

/**
 * One MDAST node of the parsed Note, with its source range in the document.
 * `from` and `to` are mapped through edits between re-parses, so they always
 * address the live document. `node` is the node as of the last parse.
 */
export interface Construct {
  /** The MDAST node type, e.g. `wikiLink`, `embed`, `heading`, `blockquote`. */
  readonly type: string;
  readonly from: number;
  readonly to: number;
  readonly node: Nodes;
}

/** Everything a provider needs to decorate one construct. */
export interface DecorationContext {
  readonly state: EditorState;
  /**
   * True when the selection touches the construct, so it should show its raw
   * syntax. Computed with {@link isRevealed} over `[from, to]`; call that
   * helper yourself for a different range (e.g. a whole Callout block).
   */
  readonly revealed: boolean;
}

export type ProviderResult =
  | Range<Decoration>
  | readonly Range<Decoration>[]
  | null
  | undefined;

/**
 * Decorates one or more kinds of construct. Later tickets register one
 * provider per construct (Wiki Link, Embed, Highlight, ...). Decorations may
 * hide or replace source text, never change it: the document stays the Note.
 */
export interface ConstructProvider {
  /** For diagnostics and de-duplication. */
  readonly name: string;
  /** The MDAST node types this provider handles. */
  readonly types: readonly string[];
  decorate(construct: Construct, context: DecorationContext): ProviderResult;
}

/** Turns Note text into constructs. Replaceable, e.g. to inject a resolver. */
export type NoteParser = (text: string) => readonly Construct[];
