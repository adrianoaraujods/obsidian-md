import {
  Binary,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  FileQuestion,
  Forward,
  List,
  SquareCheck,
  Tags,
  Text,
} from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";
import {
  Properties as HeadlessProperties,
  type PropertiesIcons,
} from "react-obsidian-md";

/** Frontmatter keys consumed by Fumadocs or the schema, not by the panel. */
const HIDDEN = ["title", "description", "icon", "full", "_openapi"];

/** Obsidian's own icons for each property type. */
const ICONS: PropertiesIcons = {
  text: <Text />,
  multitext: <List />,
  number: <Binary />,
  checkbox: <SquareCheck />,
  date: <Calendar />,
  datetime: <Clock />,
  tags: <Tags />,
  aliases: <Forward />,
  unknown: <FileQuestion />,
  expand: <ChevronRight />,
  checked: <Check strokeWidth={3} />,
};

/**
 * The headless Properties Panel from `react-obsidian-md`, with this Wiki's
 * hidden keys, lucide icons and Next.js links. Styling is in `globals.css`.
 */
export function Properties(
  props: Pick<
    ComponentProps<typeof HeadlessProperties>,
    "properties" | "storageKey" | "defaultOpen" | "noFlash"
  >,
) {
  return (
    <HeadlessProperties
      {...props}
      hiddenKeys={HIDDEN}
      icons={ICONS}
      linkComponent={Link}
    />
  );
}
