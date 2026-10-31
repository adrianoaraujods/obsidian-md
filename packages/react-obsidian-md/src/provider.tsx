"use client";

import {
  type ComponentProps,
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
} from "react";
import { previewPayloadUrl } from "./preview-types.js";
import { Properties } from "./properties.js";

type LinkComponent = ComponentType<ComponentProps<"a"> & { href: string }>;

/** What a Hover Preview hands over to render a Note's Properties Panel. */
export type PreviewPropertiesProps = {
  properties: unknown;
  storageKey: string;
  defaultOpen: boolean;
  noFlash: boolean;
};

export type ObsidianContextValue = {
  /** The component every link in a preview renders; a plain `<a>` by default. */
  linkComponent?: LinkComponent | "a";
  /** Builds the URL a Note's Preview Payload is fetched from. */
  previewPayloadUrl?: (slug: readonly string[]) => string;
  /**
   * Class for the container of a preview's body, for stylesheets scoped to a
   * Rendered Container (such as `markdown-rendered`). None by default.
   */
  previewBodyClassName?: string;
  /** Renders the Properties Panel in a preview (for icons, hidden keys). */
  renderProperties?: (props: PreviewPropertiesProps) => ReactNode;
};

const ObsidianContext = createContext<ObsidianContextValue>({});

/**
 * Supplies framework-specific pieces to Hover Previews, however deeply nested:
 * the link component, the Preview Payload URL and the Properties Panel.
 */
export function ObsidianProvider({
  children,
  ...value
}: ObsidianContextValue & { children?: ReactNode }) {
  return (
    <ObsidianContext.Provider value={value}>
      {children}
    </ObsidianContext.Provider>
  );
}

export function useObsidian(): Required<ObsidianContextValue> {
  const value = useContext(ObsidianContext);
  return {
    linkComponent: value.linkComponent ?? "a",
    previewPayloadUrl: value.previewPayloadUrl ?? previewPayloadUrl,
    previewBodyClassName: value.previewBodyClassName ?? "",
    renderProperties:
      value.renderProperties ??
      ((props) => (
        <Properties {...props} linkComponent={value.linkComponent ?? "a"} />
      )),
  };
}
