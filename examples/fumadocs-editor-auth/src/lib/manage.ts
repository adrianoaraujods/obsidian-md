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
 * here from the session, never from the request body. A stale base is never
 * forced.
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

      const result = await createCommitStorage(deps, editor).commit(
        parsed.changeset,
        parsed.base,
        parsed.message,
      );
      return json(200, result);
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
