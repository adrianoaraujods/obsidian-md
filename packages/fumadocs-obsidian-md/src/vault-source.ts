import type { ComponentType } from "react";

/** Components an MDX body accepts through its `components` prop. */
// biome-ignore lint/suspicious/noExplicitAny: components take arbitrary props
export type MdxComponentMap = Record<string, ComponentType<any>>;

/** The parts of a Fumadocs page the glue reads. */
export interface VaultPage {
  url: string;
  path: string;
  slugs: string[];
  data: {
    title: string;
    properties?: unknown;
    // MDXContent's props are stricter than a loose map; any keeps it assignable.
    // biome-ignore lint/suspicious/noExplicitAny: see above
    body: ComponentType<any>;
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
