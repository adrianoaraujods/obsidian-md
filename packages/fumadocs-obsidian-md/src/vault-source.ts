import type { ComponentType } from "react";

/** Components an MDX body accepts through its `components` prop. */
// biome-ignore lint/suspicious/noExplicitAny: components take arbitrary props; MDXContent's props are stricter than a loose map
type AnyComponent = ComponentType<any>;
export type MdxComponentMap = Record<string, AnyComponent>;

/** The parts of a Fumadocs page the glue reads. */
export interface VaultPage {
  url: string;
  path: string;
  slugs: string[];
  data: {
    title: string;
    properties?: unknown;
    body: AnyComponent;
  };
}

/**
 * The parts of a Fumadocs `loader()` result the glue reads. A real `source`
 * satisfies it, so the Wiki passes its own and no Fumadocs types leak here.
 */
export interface VaultSource {
  getPage(slug: string[]): VaultPage | undefined;
  resolveHref(href: string, page: VaultPage): string;
  getPageByHref(
    href: string,
    options: { dir: string },
  ): { page: VaultPage; hash?: string | undefined } | undefined;
  generateParams(): { slug: string[] }[];
}
