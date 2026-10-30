import { Img } from "@/components/typography/mdx-components";
import type { PreviewPayload } from "@/lib/preview-types";
import { source } from "@/lib/source";

/**
 * Builds the Preview Payload of the Note published under `slug`, or
 * `undefined` when no Note has that Slug. The body goes through the same
 * compiled MDX and plugin pipeline as the Note's page. Fumadocs' default
 * components are client components and cannot be serialized to a string, so
 * the body uses plain elements; links are plain links by design.
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
        a: ({ href, children, ...props }) => (
          <a href={href} {...props}>
            {children}
          </a>
        ),
      }}
    />,
  );

  return {
    title: page.data.title,
    properties: page.data.properties,
    html,
  };
}
