import path from "node:path";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { ComponentProps } from "react";

import { HoverPreview } from "@/components/typography/hover-preview";
import { source } from "@/lib/source";

type SourcePage = NonNullable<ReturnType<typeof source.getPage>>;

/**
 * The `a` override for a Note's page. It runs on the server with the page
 * source, so link eligibility is decided here: only an `href` that resolves
 * to a different Vault Note becomes a Hover Preview trigger. Unresolved
 * links, Assets, external links, same-Note anchors and routes outside the
 * Vault render as the default link.
 */
export function createVaultLink(page: SourcePage) {
  const DefaultLink = defaultMdxComponents.a;

  return function VaultLink({
    href,
    ...props
  }: ComponentProps<typeof DefaultLink>) {
    if (typeof href !== "string") return <DefaultLink {...props} href={href} />;

    // Relative file paths (`./Other.md`) become the published URL.
    const resolved = source.resolveHref(href, page);
    const target = source.getPageByHref(resolved, {
      dir: path.posix.dirname(page.path),
    });

    if (!target || target.page.url === page.url) {
      return <DefaultLink {...props} href={resolved} />;
    }

    return (
      <HoverPreview
        {...props}
        href={resolved}
        slug={target.page.slugs}
        subpath={target.hash}
      />
    );
  };
}
