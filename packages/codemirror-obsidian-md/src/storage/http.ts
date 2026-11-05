import { isAlreadyExistsError, isStaleShaError } from "./errors.js";
import type { Storage } from "./types.js";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/**
 * Wire protocol shared with `createStorageClient`, as a Fetch API handler for
 * a route (`GET`, `PUT`, `POST`, `DELETE` of one URL). Mount it in a Next.js
 * route handler, for example `export { handler as GET, handler as PUT, ... }`.
 *
 * `getStorage` runs on every request. Verify the session there and build the
 * storage for that person; throw a `Response` (for example a 401) to refuse.
 * Details of unexpected failures are logged with `console.error` and never sent
 * to the browser.
 */
export function createStorageHandler(
  getStorage: (request: Request) => Promise<Storage>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const storage = await getStorage(request);
      const url = new URL(request.url);

      if (request.method === "GET") {
        const commit = url.searchParams.get("deployed");
        if (commit !== null) {
          if (!storage.lock) return json(404, { error: "no-lock" });
          return json(200, { deployed: await storage.lock.isDeployed(commit) });
        }
        const path = url.searchParams.get("path");
        if (!path) return json(400, { error: "bad-request" });
        return json(200, await storage.read(path));
      }

      const body = (await request.json()) as {
        path?: string;
        content?: string;
        sha?: string;
      };
      if (typeof body.path !== "string") {
        return json(400, { error: "bad-request" });
      }

      if (request.method === "PUT") {
        if (typeof body.content !== "string" || typeof body.sha !== "string") {
          return json(400, { error: "bad-request" });
        }
        return json(
          200,
          await storage.write(body.path, body.content, body.sha),
        );
      }
      if (request.method === "POST") {
        if (typeof body.content !== "string") {
          return json(400, { error: "bad-request" });
        }
        return json(200, await storage.create(body.path, body.content));
      }
      if (request.method === "DELETE") {
        if (typeof body.sha !== "string") {
          return json(400, { error: "bad-request" });
        }
        await storage.delete(body.path, body.sha);
        return json(200, {});
      }
      return json(405, { error: "method-not-allowed" });
    } catch (error) {
      if (error instanceof Response) return error;
      if (isStaleShaError(error)) {
        return json(409, {
          error: "stale-sha",
          path: error.path,
          newer: error.newer ?? null,
        });
      }
      if (isAlreadyExistsError(error)) {
        return json(422, { error: "already-exists", path: error.path });
      }
      console.error("[codemirror-obsidian-md] storage request failed", error);
      return json(500, { error: "storage-failed" });
    }
  };
}
