"use client";

import { fromHtml } from "hast-util-from-html";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { ComponentProps } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

import { HoverPreview } from "@/components/typography/hover-preview";

type AnchorProps = ComponentProps<"a"> & {
  "data-preview-slug"?: string;
  "data-preview-subpath"?: string;
};

/**
 * A link in a preview's body. The payload builder marks the links that
 * resolve to a Vault Note with the target's Slug, so those become a nested
 * Hover Preview; every other link stays a plain link.
 */
function PreviewLink({
  "data-preview-slug": slug,
  "data-preview-subpath": subpath,
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
      slug={slug.split("/")}
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
