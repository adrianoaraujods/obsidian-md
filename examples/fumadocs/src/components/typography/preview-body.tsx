"use client";

import { fromHtml } from "hast-util-from-html";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { ComponentProps } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

import { HoverPreview } from "@/components/typography/hover-preview";
import { PREVIEW_SLUG_ATTR, PREVIEW_SUBPATH_ATTR } from "@/lib/preview-types";
import { slugFromKey } from "@/lib/slug-key";

type AnchorProps = ComponentProps<"a"> & {
  [PREVIEW_SLUG_ATTR]?: string;
  [PREVIEW_SUBPATH_ATTR]?: string;
};

/**
 * A link in a preview's body. The payload builder marks the links that
 * resolve to a Vault Note with the target's Slug, so those become a nested
 * Hover Preview; every other link stays a plain link.
 */
function PreviewLink({
  [PREVIEW_SLUG_ATTR]: slug,
  [PREVIEW_SUBPATH_ATTR]: subpath,
  href,
  children,
  ...props
}: AnchorProps) {
  if (!slug || !href) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <HoverPreview
      {...props}
      href={href}
      slug={slugFromKey(slug)}
      subpath={subpath}
    >
      {children}
    </HoverPreview>
  );
}

/**
 * Renders a Preview Payload's body (already cut to the link's Subpath) as
 * React elements, so its links can be Hover Previews themselves.
 */
export function PreviewBody({ html }: { html: string }) {
  return toJsxRuntime(fromHtml(html, { fragment: true }), {
    Fragment,
    jsx,
    jsxs,
    components: { a: PreviewLink },
  });
}
