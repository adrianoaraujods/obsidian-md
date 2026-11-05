import { getBuildSha } from "../../../lib/build";

export const dynamic = "force-dynamic";

/** The commit SHA the running build was made from, or `{ sha: null }`. */
export async function GET() {
  return Response.json(
    { sha: getBuildSha() },
    { headers: { "cache-control": "no-store" } },
  );
}
