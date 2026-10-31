import defaultMdxComponents from "fumadocs-ui/mdx";
import type { ComponentProps } from "react";
import { HoverPreview } from "react-obsidian-md";

import { resolveVaultLink } from "./vault-link-target.js";
import type { VaultPage, VaultSource } from "./vault-source.js";

/**
 * The `a` override for a Note's page. It runs on the server with the page
 * source, so link eligibility is decided here: only an `href` that resolves
 * to a different Vault Note becomes a Hover Preview trigger. Unresolved
 * links, Assets, external links, same-Note anchors and routes outside the
 * Vault render as the default link.
 */
export function createVaultLink(source: VaultSource, page: VaultPage) {
  const DefaultLink = defaultMdxComponents.a;

  return function VaultLink({
    href,
    ...props
  }: ComponentProps<typeof DefaultLink>) {
    if (typeof href !== "string") return <DefaultLink {...props} href={href} />;

    const { href: resolved, target } = resolveVaultLink(source, page, href);
    if (!target) return <DefaultLink {...props} href={resolved} />;

    return (
      <HoverPreview
        {...props}
        href={resolved}
        slug={target.slug}
        subpath={target.subpath}
      />
    );
  };
}
