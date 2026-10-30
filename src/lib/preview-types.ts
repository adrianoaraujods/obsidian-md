/** One Note, prepared at build time for Hover Previews (see ADR 0001). */
export type PreviewPayload = {
  title: string;
  /** Structured data from `getFrontmatter`; the Properties Panel renders it. */
  properties: unknown;
  /** The Note's body as rendered HTML, without Frontmatter. */
  html: string;
};

/**
 * Attributes the payload builder puts on a link that can be previewed: the
 * target Note's Slug (as a `slugKey`) and the link's Subpath.
 */
export const PREVIEW_SLUG_ATTR = "data-preview-slug";
export const PREVIEW_SUBPATH_ATTR = "data-preview-subpath";

/** Where Preview Payloads are served from. */
export const PREVIEW_PATH = "/api/preview/";

/** URL of the Preview Payload for the Note published under `slug`. */
export function previewPayloadUrl(slug: readonly string[]): string {
  return `${PREVIEW_PATH}${slug.map(encodeURIComponent).join("/")}`;
}
