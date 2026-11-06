import type {
  Blockquote,
  PhrasingContent,
  Root,
  RootContent,
  Text,
} from "mdast";
import type { Processor, Transformer } from "unified";

import type {
  CalloutNode,
  CalloutPartNode,
  CalloutsPluginOptions,
  CalloutTypeDefinition,
} from "./types.js";
import { offsetBy } from "./utils.js";

/**
 * The 13 canonical Callout types and the icon each one exposes to the theme.
 * Glyphs are CSS's job: only the Lucide icon name is emitted, as `data-icon`.
 */
export const CALLOUT_TYPES: Record<string, CalloutTypeDefinition> = {
  note: { icon: "pencil" },
  abstract: { icon: "clipboard-list" },
  info: { icon: "info" },
  todo: { icon: "check-circle-2" },
  tip: { icon: "flame" },
  success: { icon: "check" },
  question: { icon: "help-circle" },
  warning: { icon: "alert-triangle" },
  failure: { icon: "x" },
  danger: { icon: "zap" },
  bug: { icon: "bug" },
  example: { icon: "list" },
  quote: { icon: "quote" },
};

export const CALLOUT_ALIASES: Record<string, string> = {
  summary: "abstract",
  tldr: "abstract",
  hint: "tip",
  important: "tip",
  check: "success",
  done: "success",
  help: "question",
  faq: "question",
  caution: "warning",
  attention: "warning",
  fail: "failure",
  missing: "failure",
  error: "danger",
  cite: "quote",
};

const FALLBACK_TYPE = "note";

type ParsedCallout = {
  type: string;
  definition: CalloutTypeDefinition;
  defaultTitle: string;
  title: PhrasingContent[];
  fold: "+" | "-" | undefined;
  body: RootContent[];
};

/**
 * Matches the Obsidian callout marker at the start of the first line:
 * `[!type]`, an optional fold marker (`+`/`-`) and one optional space.
 */
const MARKER_REGEX = /^\[!([^\]\n]+)\]([+-]?)\s?/;

/**
 * Rewrites every Callout blockquote. `source` is the Note's raw markdown: the
 * Callout's body lines are rebuilt from text that lost its `> ` prefixes, and
 * the source is what places them back on their own range.
 */
export function transformCallouts(
  tree: Root,
  options: CalloutsPluginOptions = {},
  source?: string,
): void {
  transformChildren(tree, options, source);
}

function transformChildren(
  parent: Root | Blockquote | RootContent,
  options: CalloutsPluginOptions,
  source: string | undefined,
) {
  if (!("children" in parent)) return;

  // Deepest first, so a nested Callout is already rendered when its parent
  // moves the (transformed) children into the content wrapper.
  for (const child of parent.children) {
    transformChildren(child, options, source);
  }

  const children = parent.children as RootContent[];
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    if (child?.type !== "blockquote") continue;

    const callout = toCallout(child, options, source);
    if (callout) children[index] = callout;
  }
}

function toCallout(
  node: Blockquote,
  options: CalloutsPluginOptions,
  source: string | undefined,
): CalloutNode | undefined {
  const parsed = parseCallout(node, options, source);
  if (!parsed) return undefined;

  const { type, definition, defaultTitle, title, fold, body } = parsed;
  const foldable = fold !== undefined;

  const icon: PhrasingContent = {
    type: "text",
    value: "",
    data: {
      hName: "span",
      hProperties: {
        className: ["callout-title-icon"],
        "data-icon": definition.icon ?? "pencil",
      },
    },
  };

  const titleInner: CalloutPartNode = {
    type: "calloutPart",
    data: {
      hName: "div",
      hProperties: { className: ["callout-title-inner"] },
    },
    children:
      title.length > 0 ? title : [{ type: "text", value: defaultTitle }],
  };

  const titleWrapper: CalloutPartNode = {
    type: "calloutPart",
    data: {
      // `<summary>` is what makes a foldable Callout toggle without JS.
      hName: foldable ? "summary" : "div",
      hProperties: { className: ["callout-title"] },
    },
    children: [icon, titleInner],
  };

  const content: CalloutPartNode = {
    type: "calloutPart",
    data: {
      hName: "div",
      hProperties: { className: ["callout-content"] },
    },
    children: body,
  };

  return {
    type: "callout",
    // The Callout covers the whole blockquote it was written as.
    ...(node.position ? { position: node.position } : {}),
    data: {
      hName: foldable ? "details" : "div",
      hProperties: {
        className: foldable ? ["callout", "is-collapsible"] : ["callout"],
        "data-callout": type,
        ...(fold === "+" ? { open: true } : {}),
        ...(definition.color
          ? { style: `--callout-color: ${definition.color}` }
          : {}),
      },
    },
    children: [titleWrapper, content],
  };
}

function parseCallout(
  node: Blockquote,
  options: CalloutsPluginOptions,
  source: string | undefined,
): ParsedCallout | undefined {
  const first = node.children[0];
  if (first?.type !== "paragraph") return undefined;

  const lead = first.children[0];
  if (lead?.type !== "text") return undefined;

  const match = MARKER_REGEX.exec(lead.value);
  if (!match) return undefined;

  const rawType = match[1] ?? "";
  const { type, definition, defaultTitle } = resolveCalloutType(
    rawType,
    options.types,
  );
  const fold = (match[2] || undefined) as "+" | "-" | undefined;

  const line = splitFirstLine(first.children, source);
  const leading = line[0][0];
  if (leading?.type === "text") {
    const before = leading.value.length;
    leading.value = leading.value.slice(match[0].length).trimStart();
    // The marker sits on the first line, so the range shifts by its length.
    shiftStart(leading, before - leading.value.length);
    if (leading.value === "") line[0].shift();
  }

  const title = line[0];
  const rest = line[1];
  const body: RootContent[] = [];

  if (rest.length > 0) {
    const start = rest[0]?.position?.start;
    const end = rest.at(-1)?.position?.end;
    body.push({
      type: "paragraph",
      ...(start && end ? { position: { start, end } } : {}),
      children: rest,
    });
  }
  body.push(...node.children.slice(1));

  return { type, definition, defaultTitle, title, fold, body };
}

/** Splits phrasing children at the first soft or hard line break. */
function splitFirstLine(
  children: PhrasingContent[],
  source: string | undefined,
): [PhrasingContent[], PhrasingContent[]] {
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    if (!child) continue;

    if (child.type === "break") {
      return [children.slice(0, index), children.slice(index + 1)];
    }

    if (child.type === "text") {
      const newline = child.value.indexOf("\n");
      if (newline === -1) continue;

      const head = children.slice(0, index);
      if (newline > 0) {
        head.push(
          withRange(
            child,
            child.value.slice(0, newline),
            child.position?.start,
            child.position && offsetBy(child.position.start, newline),
          ),
        );
      }

      const tail = children.slice(index + 1);
      const remainder = child.value.slice(newline + 1);
      if (remainder !== "") {
        tail.unshift(
          withRange(
            child,
            remainder,
            nextLineStart(child, newline, source),
            child.position?.end,
          ),
        );
      }

      return [head, tail];
    }
  }

  return [children, []];
}

type Point = NonNullable<Text["position"]>["start"];

/** A copy of a text node with its own value and source range. */
function withRange(
  node: Text,
  value: string,
  start: Point | undefined,
  end: Point | undefined,
): Text {
  const { position: _position, ...rest } = node;
  return {
    ...rest,
    value,
    ...(start && end ? { position: { start, end } } : {}),
  };
}

/** Moves a first-line text node's start forward by `columns`. */
function shiftStart(node: Text, columns: number): void {
  if (!node.position || columns === 0) return;
  node.position = {
    start: offsetBy(node.position.start, columns),
    end: node.position.end,
  };
}

/**
 * Where the text after a line break starts in the source: past the newline
 * and the `>` prefix of the Callout's next line. Without the source, or when
 * the offsets do not match it (embedded content), there is no range.
 */
function nextLineStart(
  node: Text,
  newline: number,
  source: string | undefined,
): Point | undefined {
  const start = node.position?.start;
  if (!source || start?.offset === undefined) return undefined;

  const lineBreak = start.offset + newline;
  if (source[lineBreak] !== "\n") return undefined;

  const prefix = /^[ \t]*(?:>[ \t]?)+/.exec(source.slice(lineBreak + 1));
  if (!prefix) return undefined;

  return {
    line: start.line + 1,
    column: prefix[0].length + 1,
    offset: lineBreak + 1 + prefix[0].length,
  };
}

/**
 * Resolves a Callout marker's type label against the canonical and custom
 * types. Pure, so the editor shares it with the renderer.
 */
export function resolveCalloutType(
  raw: string,
  custom: CalloutsPluginOptions["types"] = {},
): { type: string; definition: CalloutTypeDefinition; defaultTitle: string } {
  const trimmed = raw.trim();
  const id = trimmed.toLowerCase();

  const resolve = (type: string, definition: CalloutTypeDefinition) => ({
    type,
    definition,
    // Obsidian titles the Callout with what the author typed, aliases included.
    defaultTitle: definition.title ?? capitalize(trimmed),
  });

  // Custom types layer on top of the canonical defaults, so a partial
  // definition (e.g. only `color`) keeps the canonical icon.
  const merge = (type: string): CalloutTypeDefinition => ({
    ...CALLOUT_TYPES[type],
    ...custom[type],
  });

  if (custom[id] || CALLOUT_TYPES[id]) return resolve(id, merge(id));

  const alias = CALLOUT_ALIASES[id];
  if (alias) return resolve(alias, merge(alias));

  // Unknown types render as `note`; the author's label survives as the title.
  return resolve(FALLBACK_TYPE, merge(FALLBACK_TYPE));
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function remarkObsidianCallouts(
  _this: Processor,
  options: CalloutsPluginOptions = {},
): Transformer<Root> {
  return (tree, file) => {
    transformCallouts(tree, options, String(file.value));
  };
}
