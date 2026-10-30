import {
  Binary,
  Calendar,
  Check,
  Clock,
  FileQuestion,
  Forward,
  List,
  type LucideIcon,
  SquareCheck,
  Tags,
  Text,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { FormattedDate } from "@/components/typography/formatted-date";
import { cn } from "@/lib/utils";

/** Frontmatter keys consumed by Fumadocs or the schema, not by the panel. */
const HIDDEN = new Set(["title", "description", "icon", "full", "_openapi"]);

/** Shape produced by remark-obsidian-md's `getFrontmatter`. */
type LinkValue = { url?: string | undefined; label: string; unresolved?: true };

/** Whole-value ISO dates, also produced by `getFrontmatter`. */
type DateValue = { date: string; kind: "date" | "datetime" };

type PropertyType =
  | "text"
  | "multitext"
  | "number"
  | "checkbox"
  | "date"
  | "datetime"
  | "tags"
  | "aliases"
  | "unknown";

/** Obsidian's own icons for each property type. */
const TYPE_ICONS: Record<PropertyType, LucideIcon> = {
  text: Text,
  multitext: List,
  number: Binary,
  checkbox: SquareCheck,
  date: Calendar,
  datetime: Clock,
  tags: Tags,
  aliases: Forward,
  unknown: FileQuestion,
};

/** Reserved frontmatter keys Obsidian types itself (case-insensitive). */
const RESERVED_TYPES: Record<string, PropertyType> = {
  aliases: "aliases",
  cssclasses: "multitext",
  tags: "tags",
};

const LINK_CLASS =
  "text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary";
const UNRESOLVED_CLASS =
  "text-muted-foreground decoration-muted-foreground decoration-dotted hover:decoration-muted-foreground";
const TAG_CLASS =
  "inline-flex max-w-full items-center rounded-full bg-primary/10 px-[0.65em] py-[0.25em] leading-none text-primary no-underline transition-colors hover:bg-primary/20";

function isLink(value: unknown): value is LinkValue {
  return typeof value === "object" && value !== null && "label" in value;
}

function isDate(value: unknown): value is DateValue {
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
 * not consulted — shape inference is enough for the icons in this vault.
 */
function inferType(key: string, value: unknown): PropertyType {
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

function BooleanValue({ value }: { value: boolean }) {
  return (
    <span
      aria-label={value ? "true" : "false"}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border",
        value
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-transparent",
      )}
      role="img"
    >
      {value ? <Check aria-hidden className="size-3" strokeWidth={3} /> : null}
    </span>
  );
}

function Value({
  value,
  type,
}: {
  value: unknown;
  type: PropertyType;
}): ReactNode {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item, index) => (
        // Wrapping in a span makes every item a flex child of the value cell,
        // so the gap separates them instead of adjacent text nodes merging.
        // biome-ignore lint/suspicious/noArrayIndexKey: build-time static values with no stable identity
        <span className="inline-flex min-w-0 items-center" key={index}>
          <Value type={type} value={item} />
        </span>
      ));
  }

  if (isLink(value)) {
    const isTag = type === "tags";
    const className = cn(isTag ? TAG_CLASS : LINK_CLASS, {
      [UNRESOLVED_CLASS]: value.unresolved,
    });
    const label = isTag ? tagLabel(value) : value.label;
    if (value.url === undefined) {
      return <span className={className}>{label}</span>;
    }
    return value.url.startsWith("/") ? (
      <Link className={className} href={value.url}>
        {label}
      </Link>
    ) : (
      <a
        className={className}
        href={value.url}
        rel="noreferrer"
        target="_blank"
      >
        {label}
      </a>
    );
  }

  if (isDate(value)) {
    return <FormattedDate date={value.date} kind={value.kind} />;
  }

  if (typeof value === "boolean") {
    return <BooleanValue value={value} />;
  }

  if (type === "tags") {
    return <span className={TAG_CLASS}>{tagLabel(value)}</span>;
  }

  if (typeof value === "number") {
    return <span className="tabular-nums">{toText(value)}</span>;
  }

  return <>{toText(value)}</>;
}

export function Properties({ properties }: { properties: unknown }) {
  if (
    typeof properties !== "object" ||
    properties === null ||
    Array.isArray(properties)
  ) {
    return null;
  }

  const rows = Object.entries(properties).filter(
    ([key, value]) => !HIDDEN.has(key) && !isEmpty(value),
  );
  if (rows.length === 0) return null;

  return (
    <div className="mb-8 flex flex-col gap-1 py-2">
      {rows.map(([key, value]) => {
        const type = inferType(key, value);
        const Icon = TYPE_ICONS[type];

        return (
          <div
            className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start rounded-[6px] focus-within:ring-1 focus-within:ring-ring hover:ring-1 hover:ring-border sm:grid-cols-[9rem_minmax(0,1fr)]"
            key={key}
          >
            <div className="flex min-h-7 min-w-0 items-center gap-2 py-1 pr-2 pl-1 text-muted-foreground">
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="truncate text-sm" title={key}>
                {key}
              </span>
            </div>
            <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-3 py-1 pr-2 text-foreground text-sm">
              <Value type={type} value={value} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
