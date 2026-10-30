import { buildPreviewPayload } from "@/lib/preview-payload";
import { source } from "@/lib/source";

/** One static JSON file per Note, prerendered at build (ADR 0001). */
export function generateStaticParams() {
  return source.generateParams();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await params;
  const payload = await buildPreviewPayload(slug ?? []);
  if (!payload) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(payload);
}
