import { type PreviewPayload, previewPayloadUrl } from "@/lib/preview-types";
import { slugKey } from "@/lib/slug-key";

const cache = new Map<string, Promise<PreviewPayload>>();

/**
 * Fetches the Preview Payload of the Note published under `slug`. The first
 * call per Slug downloads it; later calls in the session, whatever Subpath the
 * link carried, share that one request. A failed request is forgotten so a
 * later hover can retry.
 */
export function fetchPreviewPayload(
  slug: readonly string[],
): Promise<PreviewPayload> {
  const key = slugKey(slug);
  const cached = cache.get(key);
  if (cached) return cached;

  const request = fetch(previewPayloadUrl(slug))
    .then((response) => {
      if (!response.ok) throw new Error(`Preview failed: ${response.status}`);
      return response.json() as Promise<PreviewPayload>;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, request);
  return request;
}
