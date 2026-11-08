import {
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

/**
 * The route handler behind `/api/manage`: apply a Manager changeset as one
 * commit. Needs a verified session; the commit is made by the shared
 * server-side credential and its `Edited-with` / `Edited-by` trailer is built
 * here from the session, never from the request body. A stale base is rebased
 * onto the commit that landed when none of the files touched changed, and is
 * otherwise refused (409); the ref is never forced.
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
        // A commit landed since the Manager opened. If none of the files this
        // changeset touches changed, the same changes still apply on top of it.
        const changed = await storage.changedSince?.(parsed.base);
        if (!changed || changed.some((path) => paths.includes(path)))
          throw error;
        return json(
          200,
          await storage.commit(
            parsed.changeset,
            await storage.base(),
            parsed.message,
          ),
        );
      }
    } catch (error) {
      if (error instanceof Response) return error;
      if (isStaleBaseError(error)) return json(409, { error: "stale-base" });
      if (isStaleShaError(error))
        return json(409, { error: "stale-sha", path: error.path });
      if (isAlreadyExistsError(error))
        return json(422, { error: "already-exists", path: error.path });
      console.error("[manage] commit failed", error);
      return json(500, { error: "storage-failed" });
    }
  };
}
