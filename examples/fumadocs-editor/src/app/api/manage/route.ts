import {
  isAlreadyExistsError,
  isStaleBaseError,
  isStaleShaError,
} from "codemirror-obsidian-md/storage";
import { createFilesystemStorage } from "codemirror-obsidian-md/storage/filesystem";

import { parseCommitRequest } from "@/lib/manager";
import { isEditEnabled } from "@/lib/page-actions";
import { vaultDir } from "@/lib/vault-dir";

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Apply a Manager changeset to the Vault on disk as one atomic commit.
 * Development only, like the storage route: a deployed build has no writable
 * Vault, and there is no auth here.
 */
export async function POST(request: Request) {
  if (!isEditEnabled()) return new Response(null, { status: 404 });
  const parsed = parseCommitRequest(await request.json().catch(() => null));
  if (!parsed) return json(400, { error: "bad-request" });

  try {
    const storage = createFilesystemStorage({ root: vaultDir });
    const result = await storage.commit(parsed.changeset, parsed.base);
    return json(200, result);
  } catch (error) {
    if (isStaleBaseError(error)) return json(409, { error: "stale-base" });
    if (isStaleShaError(error))
      return json(409, { error: "stale-sha", path: error.path });
    if (isAlreadyExistsError(error))
      return json(422, { error: "already-exists", path: error.path });
    console.error("[manage] commit failed", error);
    return json(500, { error: "commit-failed" });
  }
}
