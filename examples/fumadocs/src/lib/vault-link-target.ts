import path from "node:path";

import { source } from "@/lib/source";

export type SourcePage = NonNullable<ReturnType<typeof source.getPage>>;

/** The Note a link points at, and the part of it (after `#`) it selects. */
export type VaultLinkTarget = {
  slug: string[];
  subpath?: string | undefined;
};

/**
 * Resolves a link `href` found in `page` to the published URL and, when it
 * points at a different Vault Note, that Note's Slug and the link's Subpath.
 * Unresolved links, Assets, external links, same-Note anchors and routes
 * outside the Vault have no target, so they get no Hover Preview.
 */
export function resolveVaultLink(
  page: SourcePage,
  href: string,
): { href: string; target?: VaultLinkTarget } {
  const resolved = source.resolveHref(href, page);
  const found = source.getPageByHref(resolved, {
    dir: path.posix.dirname(page.path),
  });

  if (!found || found.page.url === page.url) return { href: resolved };
  return {
    href: resolved,
    target: { slug: found.page.slugs, subpath: found.hash },
  };
}
