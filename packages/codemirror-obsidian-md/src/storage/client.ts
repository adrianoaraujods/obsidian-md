import { AlreadyExistsError, StaleShaError } from "./errors.js";
import type { Storage, StorageFile, StorageWriteResult } from "./types.js";

export interface StorageClientOptions {
  /** URL of the route that serves `createStorageHandler`, e.g. `/api/storage`. */
  url: string;
  /** Add the `lock` capability (the route's storage must have one). */
  lock?: boolean;
  /** Default: global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Browser storage that talks to the Example's route handler. It sends no
 * credential of its own: the browser's session cookie authenticates it, and
 * the write token stays on the server. Safe to import in client code.
 */
export function createStorageClient(options: StorageClientOptions): Storage {
  const doFetch = options.fetch ?? ((...args) => fetch(...args));

  async function call(
    method: string,
    init: { query?: Record<string, string>; body?: unknown },
    path = "",
  ): Promise<Response> {
    const query = init.query ? `?${new URLSearchParams(init.query)}` : "";
    const response = await doFetch(`${options.url}${query}`, {
      method,
      credentials: "same-origin",
      headers:
        init.body === undefined ? {} : { "content-type": "application/json" },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    if (response.ok) return response;

    let detail: { error?: string; path?: string; newer?: unknown } = {};
    try {
      detail = (await response.json()) as typeof detail;
    } catch {}
    if (response.status === 409 && detail.error === "stale-sha") {
      throw new StaleShaError(
        detail.path ?? path,
        (detail.newer as ConstructorParameters<typeof StaleShaError>[1]) ??
          undefined,
      );
    }
    if (response.status === 422 && detail.error === "already-exists") {
      throw new AlreadyExistsError(detail.path ?? path);
    }
    throw new Error(
      `Storage request failed (${response.status}${detail.error ? `: ${detail.error}` : ""})`,
    );
  }

  const storage: Storage = {
    async read(path): Promise<StorageFile> {
      return (
        await call("GET", { query: { path } }, path)
      ).json() as Promise<StorageFile>;
    },
    async write(path, content, sha): Promise<StorageWriteResult> {
      return (
        await call("PUT", { body: { path, content, sha } }, path)
      ).json() as Promise<StorageWriteResult>;
    },
    async create(path, content): Promise<StorageWriteResult> {
      return (
        await call("POST", { body: { path, content } }, path)
      ).json() as Promise<StorageWriteResult>;
    },
    async delete(path, sha) {
      await call("DELETE", { body: { path, sha } }, path);
    },
  };

  if (options.lock) {
    storage.lock = {
      async isDeployed(commit) {
        const response = await call("GET", { query: { deployed: commit } });
        return ((await response.json()) as { deployed: boolean }).deployed;
      },
    };
  }

  return storage;
}
