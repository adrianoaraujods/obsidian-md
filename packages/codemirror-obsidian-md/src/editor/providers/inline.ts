import { Decoration } from "@codemirror/view";
import { HIGHLIGHT_COLORS } from "remark-obsidian-md/syntax";

import { createNoteParser } from "../parse.js";
import type {
  Construct,
  ConstructProvider,
  NoteParser,
  ProviderResult,
} from "../types.js";

/** Hides source text; the document is untouched. */
const hide = Decoration.replace({});

/** Wiki Link (`[[Note|Alias]]`): the label as a link, markers hidden. */
export const wikiLinkProvider: ConstructProvider = {
  name: "wiki-link",
  types: ["wikiLink"],
  decorate(c, { revealed }): ProviderResult {
    if (revealed) return null;
    const value = (c.node as { value?: string }).value ?? "";
    const pipe = value.indexOf("|");
    const labelFrom = c.from + (pipe === -1 ? 2 : 2 + pipe + 1);
    const labelTo = c.to - 2;
    if (labelTo <= labelFrom) return null;
    return [
      hide.range(c.from, labelFrom),
      Decoration.mark({
        tagName: "a",
        attributes: { class: "internal-link" },
      }).range(labelFrom, labelTo),
      hide.range(labelTo, c.to),
    ];
  },
};

/** Highlight (`==text==`) with its Highlight Color, as the Wiki's `<mark>`. */
export const highlightProvider: ConstructProvider = {
  name: "highlight",
  types: ["obsidianHighlight"],
  decorate(c, { revealed, state }): ProviderResult {
    if (revealed) return null;
    const contentFrom = c.from + 2;
    const contentTo = c.to - 2;
    if (contentTo <= contentFrom) return null;
    const first = state.sliceDoc(contentFrom, contentTo).codePointAt(0);
    const emoji = first === undefined ? "" : String.fromCodePoint(first);
    const color = HIGHLIGHT_COLORS[emoji];
    const from = contentFrom + (color ? emoji.length : 0);
    return [
      hide.range(c.from, from),
      ...(contentTo > from
        ? [
            Decoration.mark({
              tagName: "mark",
              ...(color ? { attributes: { "data-highlight": color } } : {}),
            }).range(from, contentTo),
          ]
        : []),
      hide.range(contentTo, c.to),
    ];
  },
};

/** Comment (`%%…%%`): omitted from rendered output, so hidden. */
export const commentProvider: ConstructProvider = {
  name: "comment",
  types: ["obsidianComment"],
  decorate: (c, { revealed }) =>
    revealed || c.to <= c.from ? null : hide.range(c.from, c.to),
};

/** Inline Footnote (`^[text]`): superscript content, markers hidden. */
export const footnoteProvider: ConstructProvider = {
  name: "footnote",
  types: ["obsidianFootnote"],
  decorate(c, { revealed }): ProviderResult {
    if (revealed || c.to - c.from < 3) return null;
    return [
      hide.range(c.from, c.from + 2),
      ...(c.to - 1 > c.from + 2
        ? [Decoration.mark({ tagName: "sup" }).range(c.from + 2, c.to - 1)]
        : []),
      hide.range(c.to - 1, c.to),
    ];
  },
};

/** Block ID (`^id`): omitted from rendered output, so hidden. */
export const blockIdProvider: ConstructProvider = {
  name: "block-id",
  types: ["blockId"],
  decorate: (c, { revealed }) =>
    revealed || c.to <= c.from ? null : hide.range(c.from, c.to),
};

/** All Live Preview providers for Obsidian inline syntax. */
export const inlineProviders: readonly ConstructProvider[] = [
  wikiLinkProvider,
  highlightProvider,
  commentProvider,
  footnoteProvider,
  blockIdProvider,
];

const BLOCK_ID = /\s\^([A-Za-z0-9-]+)[ \t]*$/;

/**
 * Wraps a parser to also yield `blockId` constructs: the parse does not
 * produce them as nodes. A Block ID is a trailing `^id` of a paragraph or
 * heading, so code and other plain-source regions are never scanned.
 */
export function blockIdParser(
  base: NoteParser = createNoteParser(),
): NoteParser {
  return (text) => {
    const constructs = base(text);
    const ids: Construct[] = [];
    for (const c of constructs) {
      if (c.type !== "paragraph" && c.type !== "heading") continue;
      const match = BLOCK_ID.exec(text.slice(c.from, c.to));
      if (!match?.[1]) continue;
      const from = c.from + match.index + 1;
      const to = from + match[1].length + 1;
      ids.push({
        type: "blockId",
        from,
        to,
        node: { type: "text", value: text.slice(from, to) },
      });
    }
    return [...constructs, ...ids];
  };
}
