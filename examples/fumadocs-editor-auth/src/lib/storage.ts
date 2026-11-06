import type { Storage } from "codemirror-obsidian-md/storage";
import { createFilesystemStorage } from "codemirror-obsidian-md/storage/filesystem";
import { createGithubStorage } from "codemirror-obsidian-md/storage/github";
import { createStorageHandler } from "codemirror-obsidian-md/storage/http";

import type { AppEnv } from "./env";
import { vaultDir } from "./vault-dir";

/** The signed-in person a commit is attributed to. */
export type NotesEditor = { name?: string | null; login: string };

export type NotesHandlerDeps = {
  /** The verified editor for this request, or `null` when signed out. */
  getEditor: (request: Request) => Promise<NotesEditor | null>;
  env: () => AppEnv;
  /** Test seam: the fetch the GitHub storage uses. */
  fetch?: typeof fetch;
  /** Adds the deploy lock (see `/api/build`). */
  deployedCommit?: () => Promise<string | null>;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

/** Vault-relative, never absolute and never climbing out of the Vault. */
function isVaultPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  return !path.split("/").some((part) => part === ".." || part === "");
}

/** Refuse a path outside the Vault before it reaches the backend. */
function guardPaths(storage: Storage): Storage {
  const check = (path: string) => {
    if (!isVaultPath(path)) throw json(400, { error: "bad-request" });
  };
  const guarded: Storage = {
    async read(path) {
      check(path);
      return storage.read(path);
    },
    async write(path, content, sha) {
      check(path);
      return storage.write(path, content, sha);
    },
    async create(path, content) {
      check(path);
      return storage.create(path, content);
    },
    async delete(path, sha) {
      check(path);
      return storage.delete(path, sha);
    },
  };
  if (storage.lock) guarded.lock = storage.lock;
  return guarded;
}

/**
 * The route handler behind `/api/notes`. Every request needs a verified
 * session. Commits are made by the one server-side credential; the
 * `Edited-by` trailer comes from the session, never from the request body.
 * In development (no `GITHUB_REPO`) Notes are read and written on disk.
 */
export function createNotesHandler(deps: NotesHandlerDeps) {
  return createStorageHandler(async (request) => {
    const editor = await deps.getEditor(request);
    if (!editor) throw json(401, { error: "unauthorized" });

    const env = deps.env();
    if (!env.githubRepo) {
      return guardPaths(createFilesystemStorage({ root: vaultDir }));
    }

    const { credential } = env;
    return guardPaths(
      createGithubStorage({
        repo: env.githubRepo,
        ...(env.githubBranch ? { branch: env.githubBranch } : {}),
        vaultPath: env.vaultPath,
        baseUrl: env.githubApiUrl,
        credential:
          credential?.kind === "app"
            ? {
                app: {
                  appId: credential.appId,
                  privateKey: credential.privateKey,
                  installationId: credential.installationId,
                },
              }
            : { token: credential?.token ?? "" },
        // Only the verified identity: nothing from the request body.
        editor: { name: editor.name, login: editor.login },
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
        ...(deps.deployedCommit ? { deployedCommit: deps.deployedCommit } : {}),
      }),
    );
  });
}
