import { getAuth } from "@/lib/auth";
import { resolveDeployedCommit } from "@/lib/build";
import { getEnv } from "@/lib/env";
import { createManageHandler } from "@/lib/manage";

/**
 * Apply a Manager changeset as one commit. Signed-out requests get a 401;
 * the commit is made by the shared server-side credential, and its
 * `Edited-by` trailer comes from the verified session (see ADR 0015 and 0017).
 */
const handler = createManageHandler({
  env: getEnv,
  deployedCommit: () => resolveDeployedCommit(),
  getEditor: async (request) => {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session) return null;
    const { name, login } = session.user as { name?: string; login?: string };
    return login ? { name, login } : null;
  },
});

export const dynamic = "force-dynamic";
export { handler as POST };
