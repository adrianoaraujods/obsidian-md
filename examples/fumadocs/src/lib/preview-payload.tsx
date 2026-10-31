import {
  PREVIEW_SLUG_ATTR,
  PREVIEW_SUBPATH_ATTR,
  type PreviewPayload,
  slugKey,
} from "react-obsidian-md";
import { Img } from "@/components/typography/mdx-components";

import { source } from "@/lib/source";
import { resolveVaultLink } from "@/lib/vault-link-target";

/**
 * Builds the Preview Payload of the Note published under `slug`, or
 * `undefined` when no Note has that Slug. The body goes through the same
 * compiled MDX and plugin pipeline as the Note's page. Fumadocs' default
 * components are client components and cannot be serialized to a string, so
 * the body uses plain elements; eligible links are marked for the client to turn into Hover Previews.
 */
export async function buildPreviewPayload(
  slug: string[],
): Promise<PreviewPayload | undefined> {
  const page = source.getPage(slug);
  if (!page) return undefined;

  // Next.js refuses a static `react-dom/server` import in the server-component
  // layer. Loading it at runtime is fine here: the body is plain elements, so
  // the full React renderer can serialize it.
  const { renderToStaticMarkup } = await import(
    /* turbopackIgnore: true */ "react-dom/server"
  );
  const MDX = page.data.body;
  const html = renderToStaticMarkup(
    <MDX
      components={{
        img: Img,
        a: ({ href, children, ...props }) => {
          if (typeof href !== "string") return <a {...props}>{children}</a>;
          // Eligibility is decided relative to the Note being previewed, so
          // the client, which has no page source, only follows the marks.
          const { href: resolved, target } = resolveVaultLink(page, href);
          return (
            <a
              href={resolved}
              {...props}
              {...(target && {
                [PREVIEW_SLUG_ATTR]: slugKey(target.slug),
                [PREVIEW_SUBPATH_ATTR]: target.subpath,
              })}
            >
              {children}
            </a>
          );
        },
      }}
    />,
  );

  return {
    title: page.data.title,
    properties: page.data.properties,
    html,
  };
}
