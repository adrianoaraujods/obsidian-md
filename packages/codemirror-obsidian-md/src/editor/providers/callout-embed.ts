import type { Extension, Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import {
  CALLOUT_ALIASES,
  CALLOUT_TYPES,
  type CalloutTypeDefinition,
} from "remark-obsidian-md/syntax";

import { constructProviders } from "../state.js";
import type { ConstructProvider } from "../types.js";

export interface CalloutEmbedOptions {
  /** Custom Callout types, layered over the canonical ones (as in the Wiki). */
  types?: Record<string, CalloutTypeDefinition>;
  /**
   * Turns an Asset Embed's target into an image URL. Return `undefined` when
   * the Asset does not exist (it then shows as an unresolved chip). Default:
   * the target itself.
   */
  resolveAsset?: (target: string) => string | undefined;
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "avif",
  "bmp",
  "ico",
]);

// -- Callouts ---------------------------------------------------------------

/** First line of a Callout: `> [!type]+ Title`. */
const CALLOUT_LINE = /^[ \t]*>[ \t]?\[!([^\]\n]+)\]([+-]?)[ \t]*(.*)$/;
const QUOTE_PREFIX = /^[ \t]*>[ \t]?/;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function resolveType(
  raw: string,
  custom: Record<string, CalloutTypeDefinition>,
) {
  const label = raw.trim();
  const id = label.toLowerCase();
  const merge = (type: string): CalloutTypeDefinition => ({
    ...CALLOUT_TYPES[type],
    ...custom[type],
  });
  const type =
    custom[id] || CALLOUT_TYPES[id] ? id : (CALLOUT_ALIASES[id] ?? "note");
  const definition = merge(type);
  return {
    type,
    icon: definition.icon ?? "pencil",
    color: definition.color,
    title: definition.title ?? capitalize(label),
  };
}

class CalloutTitleWidget extends WidgetType {
  constructor(
    readonly icon: string,
    readonly title: string,
  ) {
    super();
  }
  eq(other: CalloutTitleWidget) {
    return other.icon === this.icon && other.title === this.title;
  }
  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "callout-title";
    const icon = document.createElement("span");
    icon.className = "callout-title-icon";
    icon.setAttribute("data-icon", this.icon);
    const inner = document.createElement("div");
    inner.className = "callout-title-inner";
    inner.textContent = this.title;
    wrap.append(icon, inner);
    return wrap;
  }
}

function createCalloutProvider(
  options: CalloutEmbedOptions,
): ConstructProvider {
  const custom = options.types ?? {};
  return {
    name: "callout",
    types: ["blockquote"],
    decorate(construct, { state, revealed }) {
      const doc = state.doc;
      const first = doc.lineAt(construct.from);
      const match = CALLOUT_LINE.exec(first.text);
      if (!match) return null;

      const { type, icon, color, title } = resolveType(match[1] ?? "", custom);
      const typed = (match[3] ?? "").trim();
      const attributes: Record<string, string> = { "data-callout": type };
      if (color) attributes.style = `--callout-color: ${color}`;

      const out: Range<Decoration>[] = [];
      const last = doc.lineAt(construct.to);
      for (let n = first.number; n <= last.number; n++) {
        const line = doc.line(n);
        const isFirst = n === first.number;
        const classes = [
          "callout",
          "cm-callout",
          isFirst ? "cm-callout-first" : "callout-content",
          n === last.number ? "cm-callout-last" : "",
        ]
          .filter(Boolean)
          .join(" ");
        out.push(
          Decoration.line({ class: classes, attributes }).range(line.from),
        );
        if (revealed) continue;
        if (isFirst) {
          out.push(
            Decoration.replace({
              widget: new CalloutTitleWidget(icon, typed || title),
            }).range(line.from, line.to),
          );
        } else {
          const prefix = QUOTE_PREFIX.exec(line.text)?.[0];
          if (prefix) {
            out.push(
              Decoration.replace({}).range(
                line.from,
                line.from + prefix.length,
              ),
            );
          }
        }
      }
      return out;
    },
  };
}

// -- Embeds -----------------------------------------------------------------

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly width: string | undefined,
    readonly height: string | undefined,
  ) {
    super();
  }
  eq(o: ImageWidget) {
    return (
      o.src === this.src &&
      o.alt === this.alt &&
      o.width === this.width &&
      o.height === this.height
    );
  }
  toDOM() {
    const img = document.createElement("img");
    img.className = "internal-embed";
    img.setAttribute("src", this.src);
    img.setAttribute("alt", this.alt);
    if (this.width) img.setAttribute("width", this.width);
    if (this.height) img.setAttribute("height", this.height);
    return img;
  }
}

class ChipWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly unresolved: boolean,
  ) {
    super();
  }
  eq(o: ChipWidget) {
    return o.label === this.label && o.unresolved === this.unresolved;
  }
  toDOM() {
    const chip = document.createElement("span");
    chip.className = `internal-embed cm-embed-chip${this.unresolved ? " is-unresolved" : ""}`;
    chip.textContent = this.label;
    return chip;
  }
}

function createEmbedProvider(options: CalloutEmbedOptions): ConstructProvider {
  const resolveAsset = options.resolveAsset ?? ((target) => target);
  return {
    name: "embed",
    types: ["embed"],
    decorate(construct, { revealed }) {
      if (revealed) return null;
      const value = (construct.node as { value?: unknown }).value;
      if (typeof value !== "string") return null;

      const bar = value.indexOf("|");
      const target = (bar === -1 ? value : value.slice(0, bar)).trim();
      const alias = bar === -1 ? undefined : value.slice(bar + 1).trim();
      if (!target) return null;

      const path = target.split("#")[0] ?? target;
      const ext = path.includes(".")
        ? path.slice(path.lastIndexOf(".") + 1).toLowerCase()
        : "";

      let widget: WidgetType;
      if (IMAGE_EXTENSIONS.has(ext)) {
        const src = resolveAsset(path);
        const size = alias?.match(/^(\d+)(?:x(\d+))?$/i);
        widget = src
          ? new ImageWidget(
              src,
              size ? "" : (alias ?? ""),
              size?.[1],
              size?.[2],
            )
          : new ChipWidget(alias || target, true);
      } else {
        widget = new ChipWidget(alias || target, false);
      }
      return Decoration.replace({ widget }).range(construct.from, construct.to);
    },
  };
}

// -- Packaging --------------------------------------------------------------

const theme = EditorView.baseTheme({
  ".cm-callout": {
    paddingLeft: "12px",
    paddingRight: "12px",
    borderLeft:
      "1px solid color-mix(in srgb, var(--callout-color) 30%, transparent)",
    borderRight:
      "1px solid color-mix(in srgb, var(--callout-color) 30%, transparent)",
    backgroundColor:
      "color-mix(in srgb, var(--callout-color) 10%, transparent)",
  },
  ".cm-callout-first": {
    borderTop:
      "1px solid color-mix(in srgb, var(--callout-color) 30%, transparent)",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    paddingTop: "8px",
  },
  ".cm-callout-last": {
    borderBottom:
      "1px solid color-mix(in srgb, var(--callout-color) 30%, transparent)",
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
    paddingBottom: "8px",
  },
  ".cm-embed-chip": {
    padding: "0 6px",
    borderRadius: "4px",
    backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)",
  },
  ".cm-content img.internal-embed": { maxWidth: "100%" },
});

/**
 * Live Preview for Callouts and Embeds (a Callout renders with its type's
 * color and icon, an Asset Embed as its image, a Note Embed as a chip; each
 * shows its raw syntax while the cursor is inside). Pass it in `extensions`.
 *
 * The widgets reuse the plugin Stylesheet class names, which are scoped under
 * `.markdown-rendered` (ADR 0008): this adds that class to the editor, and the
 * consumer imports `remark-obsidian-md/styles.css` (and a dark variant).
 */
export function calloutEmbed(options: CalloutEmbedOptions = {}): Extension {
  return [
    constructProviders.of(createCalloutProvider(options)),
    constructProviders.of(createEmbedProvider(options)),
    EditorView.editorAttributes.of({ class: "markdown-rendered" }),
    theme,
  ];
}
