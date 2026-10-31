import { buildPreviewPayload } from "../preview-payload.js";
import type { VaultSource } from "../vault-source.js";

/**
 * The Preview Payload route handlers. Export them from
 * `app/api/preview/[[...slug]]/route.ts`: that path is where
 * `react-obsidian-md` fetches payloads from by default.
 *
 * One static JSON file per Note, prerendered at build (ADR 0009).
 */
export function createPreviewRoute(source: VaultSource) {
  return {
    generateStaticParams: () => source.generateParams(),

    async GET(
      _request: Request,
      { params }: { params: Promise<{ slug?: string[] }> },
    ): Promise<Response> {
      const { slug } = await params;
      const payload = await buildPreviewPayload(source, slug ?? []);
      if (!payload) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      return Response.json(payload);
    },
  };
}
