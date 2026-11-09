import {
  type Change,
  isAlreadyExistsError,
  isStaleBaseError,
  isStaleShaError,
} from "codemirror-obsidian-md/storage";

import { parseCommitRequest } from "./manager";
import {
  createCommitStorage,
  isVaultPath,
  json,
  type NotesHandlerDeps,
} from "./storage";

/** A refused (401, 403) or missing commit credential. */
function isCredentialError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as { status?: unknown }).status;
  return (
    status === 401 ||
    status === 403 ||
    error.message.startsWith("No GitHub credential")
  );
}

const NOTE = /\.md$/i;

/** Every folder above a path, nearest first, without the Vault root. */
function ancestors(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, parts.length - i).join("/"));
}

/**
 * Whether a changeset still applies on top of a commit that landed after its
 * base. Conservative: it does not when any changed path is
 * - in the changeset (a rename counts both ends),
 * - a Note, because the link rewrites were computed from the Note text we
 *   read, so a Note added or edited meanwhile may link to what we move, or
 * - inside a folder a renamed file leaves or enters (a moved folder), since a
 *   file added there would be stranded or left with broken links.
 * Only an unrelated non-Note file (an Asset elsewhere) may be rebased over.
 */
export function canRebase(
  changeset: readonly Change[],
  changed: readonly string[],
): boolean {
  const touched = new Set(
    changeset.flatMap((change) =>
      change.type === "rename" ? [change.from, change.to] : [change.path],
    ),
  );
  const moved = new Set(
    changeset.flatMap((change) =>
      change.type === "rename"
        ? [...ancestors(change.from), ...ancestors(change.to)]
        : [],
    ),
  );
  return changed.every(
    (path) =>
      !touched.has(path) &&
      !NOTE.test(path) &&
      !ancestors(path).some((folder) => moved.has(folder)),
  );
}

/**
 * The route handler behind `/api/manage`: apply a Manager changeset as one
 * commit. Needs a verified session; the commit is made by the shared
 * server-side credential and its `Edited-with` / `Edited-by` trailer is built
 * here from the session, never from the request body. A stale base is rebased
 * onto the commit that landed only when every file that changed is unrelated
 * to the changeset (see `canRebase`), and is otherwise refused (409); the ref
 * is never forced.
 */
export function createManageHandler(deps: NotesHandlerDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const editor = await deps.getEditor(request);
      if (!editor) return json(401, { error: "unauthorized" });

      const parsed = parseCommitRequest(await request.json().catch(() => null));
      if (!parsed) return json(400, { error: "bad-request" });
      const paths = parsed.changeset.flatMap((change) =>
        change.type === "rename" ? [change.from, change.to] : [change.path],
      );
      if (!paths.every(isVaultPath)) return json(400, { error: "bad-request" });

      const storage = createCommitStorage(deps, editor);
      try {
        return json(
          200,
          await storage.commit(parsed.changeset, parsed.base, parsed.message),
        );
      } catch (error) {
        if (!isStaleBaseError(error)) throw error;
        // A commit landed since the Manager opened. The same changes still
        // apply on top of it only when what changed is unrelated to them.
        const changed = await storage.changedSince?.(parsed.base);
        if (!changed || !canRebase(parsed.changeset, changed)) throw error;
        // `rebased` tells the Manager it never loaded what landed meanwhile,
        // so it must reload before planning anything else.
        return json(200, {
          ...(await storage.commit(
            parsed.changeset,
            await storage.base(),
            parsed.message,
          )),
          rebased: true,
        });
      }
    } catch (error) {
      if (error instanceof Response) return error;
      if (isStaleBaseError(error)) return json(409, { error: "stale-base" });
      if (isStaleShaError(error))
        return json(409, { error: "stale-sha", path: error.path });
      if (isAlreadyExistsError(error))
        return json(422, { error: "already-exists", path: error.path });
      console.error("[manage] commit failed", error);
      // Only a refused or missing credential is the owner's setup problem;
      // anything else (a too large repo tree, a GitHub outage) is not.
      return json(500, {
        error: isCredentialError(error) ? "storage-failed" : "commit-failed",
      });
    }
  };
}
