import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { createNotesHandler } from "@/lib/storage";

/**
 * Read, save (PUT), create (POST) and delete (DELETE) a Note, for the editor's
 * `createStorageClient({ endpoint: "/api/notes" })`. Signed-out requests get a
 * 401; commits use the shared server-side credential (see ADR 0015).
 */
const handler = createNotesHandler({
  env: getEnv,
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
export { handler as GET, handler as PUT, handler as POST, handler as DELETE };
