import type { ComponentProps, ComponentType, ReactNode } from "react";
import type {
  FrontmatterDate,
  FrontmatterLink,
  PropertyType,
} from "remark-obsidian-md";

import { FormattedDate } from "./formatted-date.js";
import { PAGE_PROPERTIES_KEY } from "./properties-keys.js";
import { PropertiesPanel } from "./properties-panel.js";

/** The property types the panel infers, mirroring Obsidian's. */
type InferredType = Extract<
  PropertyType,
  | "text"
  | "multitext"
  | "number"
  | "checkbox"
  | "date"
  | "datetime"
  | "tags"
  | "aliases"
>;

/**
 * Icon slots: one per property type, `unknown` for the rest, `expand` for the
 * expand/collapse control and `checked` for a checked checkbox.
 */
export type PropertiesIcons = Partial<
  Record<InferredType | "unknown" | "expand" | "checked", ReactNode>
>;

type Type = InferredType | "unknown";

/** Reserved frontmatter keys Obsidian types itself (case-insensitive). */
const RESERVED_TYPES: Record<string, InferredType> = {
  aliases: "aliases",
  cssclasses: "multitext",
  tags: "tags",
};

function isLink(value: unknown): value is FrontmatterLink {
  return typeof value === "object" && value !== null && "label" in value;
}

function isDate(value: unknown): value is FrontmatterDate {
  return (
    typeof value === "object" &&
    value !== null &&
    "date" in value &&
    "kind" in value
  );
}

/** An empty frontmatter value (`Etiquetas:` → null, `tags: []`, blank text). */
function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Plain nested objects are rare in vaults; render them flat as `key: value`. */
function toText(value: unknown): string {
  if (isLink(value)) return value.label;
  if (isDate(value)) return value.date;
  if (Array.isArray(value)) return value.map((item) => toText(item)).join(", ");
  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${toText(item)}`)
      .join(", ");
  }
  return String(value);
}

/**
 * Mirrors Obsidian's property type inference: reserved keys first, then the
 * value's shape. Declared types from `.obsidian/types.json` are intentionally
 * not consulted.
 */
function inferType(key: string, value: unknown): Type {
  const reserved = RESERVED_TYPES[key.toLowerCase()];
  if (reserved) return reserved;
  if (value === null || value === undefined) return "text";
  if (Array.isArray(value)) return "multitext";
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (isDate(value)) return value.kind;
  if (isLink(value) || typeof value === "string") return "text";
  return "unknown";
}

/** Obsidian shows tags with a leading `#`, even when the YAML omits it. */
function tagLabel(value: unknown): string {
  const text = isLink(value) ? value.label : toText(value);
  return `#${text.replace(/^#/, "")}`;
}

type LinkComponent = ComponentType<ComponentProps<"a"> & { href: string }>;

type ValueOptions = {
  linkComponent: LinkComponent | "a";
  renderDate: (value: FrontmatterDate) => ReactNode;
  checkedIcon: ReactNode;
};

function Value({
  value,
  type,
  options,
}: {
  value: unknown;
  type: Type;
  options: ValueOptions;
}): ReactNode {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: build-time static values with no stable identity
        <span data-properties-item="" key={index}>
          <Value options={options} type={type} value={item} />
        </span>
      ));
  }

  if (isLink(value)) {
    const isTag = type === "tags";
    const label = isTag ? tagLabel(value) : value.label;
    const marks = {
      ...(isTag ? { "data-property-tag": "" } : {}),
      ...("unresolved" in value ? { "data-unresolved": "" } : {}),
    };
    if (value.url === undefined) {
      return (
        <span data-property-link="unresolved" {...marks}>
          {label}
        </span>
      );
    }
    if (value.url.startsWith("/")) {
      const Link = options.linkComponent;
      return (
        <Link data-property-link="internal" href={value.url} {...marks}>
          {label}
        </Link>
      );
    }
    return (
      <a
        data-property-link="external"
        href={value.url}
        rel="noreferrer"
        target="_blank"
        {...marks}
      >
        {label}
      </a>
    );
  }

  if (isDate(value)) return options.renderDate(value);

  if (typeof value === "boolean") {
    return (
      <span
        aria-label={value ? "true" : "false"}
        data-checked={value}
        data-property-checkbox=""
        role="img"
      >
        {value ? options.checkedIcon : null}
      </span>
    );
  }

  if (type === "tags") {
    return <span data-property-tag="">{tagLabel(value)}</span>;
  }

  if (typeof value === "number") {
    return <span data-property-number="">{toText(value)}</span>;
  }

  return <>{toText(value)}</>;
}

/**
 * The Properties Panel: a collapsible list of a Note's Frontmatter, as
 * produced by `getFrontmatter`. Headless: it emits `data-properties-*` and
 * `data-property-*` attributes and no classes, so all styling comes from your
 * CSS, and icons arrive through the `icons` slots.
 */
export function Properties({
  properties,
  storageKey = PAGE_PROPERTIES_KEY,
  defaultOpen = true,
  noFlash = true,
  hiddenKeys,
  icons,
  label,
  linkComponent = "a",
  dateLocales,
  dateOptions,
  renderDate,
}: {
  properties: unknown;
  /** localStorage key remembering the open state; one per surface. */
  storageKey?: string;
  defaultOpen?: boolean;
  /** Emit the inline script that applies the stored state before hydration. */
  noFlash?: boolean;
  /** Frontmatter keys to leave out (for example ones a framework consumes). */
  hiddenKeys?: readonly string[];
  /** Icon slots per property type, plus `expand`; none by default. */
  icons?: PropertiesIcons;
  /** The panel trigger's text; defaults to "Properties". */
  label?: ReactNode;
  /** Component for Vault-internal links; defaults to a plain `<a>`. */
  linkComponent?: LinkComponent | "a";
  /** `Intl` locales for dates; defaults to the browser's. */
  dateLocales?: Intl.LocalesArgument;
  /** `Intl.DateTimeFormat` options for dates; defaults to a numeric format. */
  dateOptions?: Intl.DateTimeFormatOptions;
  /** Replaces the date rendering entirely. */
  renderDate?: (value: FrontmatterDate) => ReactNode;
}) {
  if (
    typeof properties !== "object" ||
    properties === null ||
    Array.isArray(properties)
  ) {
    return null;
  }

  const hidden = new Set(hiddenKeys);
  const rows = Object.entries(properties).filter(
    ([key, value]) => !hidden.has(key) && !isEmpty(value),
  );
  if (rows.length === 0) return null;

  const options: ValueOptions = {
    linkComponent,
    checkedIcon: icons?.checked,
    renderDate:
      renderDate ??
      ((value) => (
        <FormattedDate
          date={value.date}
          kind={value.kind}
          {...(dateLocales !== undefined ? { locales: dateLocales } : {})}
          {...(dateOptions !== undefined ? { options: dateOptions } : {})}
        />
      )),
  };

  return (
    <PropertiesPanel
      defaultOpen={defaultOpen}
      expandIcon={icons?.expand}
      label={label}
      noFlash={noFlash}
      storageKey={storageKey}
    >
      <div data-properties-list="">
        {rows.map(([key, value]) => {
          const type = inferType(key, value);
          const icon = icons?.[type];

          return (
            <div
              data-properties-row=""
              data-property-key={key}
              data-property-type={type}
              key={key}
            >
              <div data-properties-key="">
                {icon ? (
                  <span aria-hidden data-properties-type-icon="">
                    {icon}
                  </span>
                ) : null}
                <span data-properties-name="" title={key}>
                  {key}
                </span>
              </div>
              <div data-properties-value="">
                <Value options={options} type={type} value={value} />
              </div>
            </div>
          );
        })}
      </div>
    </PropertiesPanel>
  );
}
