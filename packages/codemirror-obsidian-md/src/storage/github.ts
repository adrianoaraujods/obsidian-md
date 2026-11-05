import { createSign } from "node:crypto";

import {
  AlreadyExistsError,
  type NewerChange,
  StaleShaError,
} from "./errors.js";
import type { Storage, StorageFile, StorageWriteResult } from "./types.js";

/** A GitHub App installation, used to mint short-lived tokens. */
export interface GithubAppCredential {
  appId: string;
  /** PEM private key of the App (PKCS#1 or PKCS#8). */
  privateKey: string;
  installationId: string;
}

/**
 * The one credential that commits. Needs Contents read/write on the Vault
 * repo only. When both are set, the App wins.
 */
export interface GithubCredential {
  /** Fine-grained personal access token. */
  token?: string;
  app?: GithubAppCredential;
}

/** The signed-in person a commit is attributed to, from the verified session. */
export interface GithubEditor {
  name?: string | null;
  login: string;
}

export interface GithubStorageOptions {
  /** `owner/name` of the repo that holds the Vault. */
  repo: string;
  /** Default: the repo's default branch. */
  branch?: string;
  /** Subdirectory of the repo that holds the Vault (`VAULT_PATH`). Default: the repo root. */
  vaultPath?: string;
  credential: GithubCredential;
  /** Named in the `Edited-by` trailer. Build it on the server from the session. */
  editor?: GithubEditor;
  /** Default: global `fetch`. */
  fetch?: typeof fetch;
  /** Default `https://api.github.com`. */
  baseUrl?: string;
  /**
   * Returns the commit SHA the deployed build was made from, or `null` when
   * the host exposes none. Providing it adds the `lock` capability.
   */
  deployedCommit?: () => Promise<string | null>;
}

/** A GitHub API response that is not one of the two expected storage failures. */
export class GithubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`GitHub API ${status}: ${message}`);
    this.name = "GithubApiError";
    this.status = status;
  }
}

/** Choose the credential to use: the App wins when both are set. */
export function resolveGithubCredential(
  credential: GithubCredential,
): { token: string } | { app: GithubAppCredential } {
  if (credential.app) return { app: credential.app };
  if (credential.token) return { token: credential.token };
  throw new Error(
    "No GitHub credential: set a fine-grained token or a GitHub App installation",
  );
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function appJwt(app: GithubAppCredential): string {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: app.appId }),
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(app.privateKey);
  return `${unsigned}.${base64url(signature)}`;
}

const TRAILER = "Edited-with: obsidian-md editor";

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function commitMessage(
  verb: "Update" | "Create" | "Delete",
  path: string,
  editor: GithubEditor | undefined,
): string {
  const lines = [`${verb} ${path}`, "", TRAILER];
  if (editor) {
    const login = oneLine(editor.login);
    const name = editor.name ? oneLine(editor.name) : "";
    lines.push(`Edited-by: ${name ? `${name} (@${login})` : `@${login}`}`);
  }
  return lines.join("\n");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Storage over the GitHub Contents API. Server-side only: it holds the write
 * credential. Each `write`, `create` and `delete` is one commit. Create one per
 * request so `editor` names the person who made it.
 */
export function createGithubStorage(options: GithubStorageOptions): Storage {
  const doFetch = options.fetch ?? ((...args) => fetch(...args));
  const baseUrl = (options.baseUrl ?? "https://api.github.com").replace(
    /\/+$/,
    "",
  );
  const credential = resolveGithubCredential(options.credential);
  const prefix = (options.vaultPath ?? "").replace(/^\/+|\/+$/g, "");
  const repoUrl = `${baseUrl}/repos/${options.repo}`;

  let installation: { token: string; expiresAt: number } | undefined;

  async function bearer(): Promise<string> {
    if ("token" in credential) return credential.token;
    const now = Date.now();
    if (installation && installation.expiresAt - 60_000 > now) {
      return installation.token;
    }
    const { app } = credential;
    const response = await doFetch(
      `${baseUrl}/app/installations/${app.installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${appJwt(app)}`,
        },
      },
    );
    if (!response.ok) throw await apiError(response);
    const body = (await response.json()) as {
      token: string;
      expires_at: string;
    };
    installation = {
      token: body.token,
      expiresAt: Date.parse(body.expires_at),
    };
    return body.token;
  }

  async function api(
    url: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<Response> {
    return doFetch(url, {
      method: init.method ?? "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${await bearer()}`,
        "x-github-api-version": "2022-11-28",
        ...(init.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  }

  async function apiError(response: Response): Promise<GithubApiError> {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {}
    return new GithubApiError(response.status, message);
  }

  const repoPath = (path: string) => (prefix ? `${prefix}/${path}` : path);
  const contentsUrl = (path: string) =>
    `${repoUrl}/contents/${encodePath(repoPath(path))}`;
  const refQuery = () =>
    options.branch ? `?ref=${encodeURIComponent(options.branch)}` : "";

  async function newerChange(path: string): Promise<NewerChange | undefined> {
    try {
      const params = new URLSearchParams({
        path: repoPath(path),
        per_page: "1",
      });
      if (options.branch) params.set("sha", options.branch);
      const response = await api(`${repoUrl}/commits?${params}`);
      if (!response.ok) return undefined;
      const [latest] = (await response.json()) as Array<{
        author?: { login?: string } | null;
        commit?: { author?: { name?: string; date?: string } };
      }>;
      if (!latest) return undefined;
      const name = latest.commit?.author?.name;
      const login = latest.author?.login;
      const author = name
        ? login
          ? `${name} (@${login})`
          : name
        : login
          ? `@${login}`
          : undefined;
      const time = latest.commit?.author?.date;
      return {
        ...(author ? { author } : {}),
        ...(time ? { time } : {}),
      };
    } catch {
      return undefined;
    }
  }

  async function commitChange(
    method: "PUT" | "DELETE",
    verb: "Update" | "Create" | "Delete",
    path: string,
    body: { content?: string; sha?: string },
  ): Promise<{ sha: string; commit: string }> {
    const response = await api(contentsUrl(path), {
      method,
      body: {
        message: commitMessage(verb, path, options.editor),
        ...body,
        ...(options.branch ? { branch: options.branch } : {}),
      },
    });
    if (verb === "Create" && response.status === 422) {
      throw new AlreadyExistsError(path);
    }
    if (
      verb !== "Create" &&
      (response.status === 409 || response.status === 404)
    ) {
      throw new StaleShaError(path, await newerChange(path));
    }
    if (!response.ok) throw await apiError(response);
    const result = (await response.json()) as {
      content: { sha: string } | null;
      commit: { sha: string };
    };
    return { sha: result.content?.sha ?? "", commit: result.commit.sha };
  }

  const storage: Storage = {
    async read(path): Promise<StorageFile> {
      const response = await api(`${contentsUrl(path)}${refQuery()}`);
      if (!response.ok) throw await apiError(response);
      const file = (await response.json()) as {
        sha: string;
        content: string;
        encoding: string;
      };
      if (file.encoding !== "base64") {
        throw new Error(`"${path}" is not a file the Contents API can return`);
      }
      return {
        content: Buffer.from(file.content, "base64").toString("utf8"),
        sha: file.sha,
      };
    },

    async write(path, content, sha): Promise<StorageWriteResult> {
      return commitChange("PUT", "Update", path, {
        content: Buffer.from(content, "utf8").toString("base64"),
        sha,
      });
    },

    async create(path, content): Promise<StorageWriteResult> {
      return commitChange("PUT", "Create", path, {
        content: Buffer.from(content, "utf8").toString("base64"),
      });
    },

    async delete(path, sha) {
      await commitChange("DELETE", "Delete", path, { sha });
    },
  };

  const { deployedCommit } = options;
  if (deployedCommit) {
    storage.lock = {
      async isDeployed(commit) {
        const deployed = await deployedCommit();
        if (!deployed) return false;
        const response = await api(
          `${repoUrl}/compare/${encodeURIComponent(commit)}...${encodeURIComponent(deployed)}`,
        );
        if (!response.ok) return false;
        const { status } = (await response.json()) as { status: string };
        return status === "identical" || status === "ahead";
      },
    };
  }

  return storage;
}
