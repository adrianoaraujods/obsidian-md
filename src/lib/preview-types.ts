/** One Note, prepared at build time for Hover Previews (see ADR 0001). */
export type PreviewPayload = {
  title: string;
  /** Structured data from `getFrontmatter`; the Properties Panel renders it. */
  properties: unknown;
  /** The Note's body as rendered HTML, without Frontmatter. */
  html: string;
};

/** URL of the Preview Payload for the Note published under `slug`. */
export function previewPayloadUrl(slug: readonly string[]): string {
  return `/api/preview/${slug.map(encodeURIComponent).join("/")}`;
}
