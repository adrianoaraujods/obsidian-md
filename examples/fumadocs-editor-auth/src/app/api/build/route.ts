import { resolveDeployedCommit } from "../../../lib/build";

export const dynamic = "force-dynamic";

/** The commit SHA the running build was made from, or `{ sha: null }`. */
export async function GET() {
  return Response.json(
    { sha: await resolveDeployedCommit() },
    { headers: { "cache-control": "no-store" } },
  );
}
