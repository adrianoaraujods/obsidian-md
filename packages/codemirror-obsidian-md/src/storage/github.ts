import { createSign } from "node:crypto";

import { folderOf } from "../paths.js";

import {
  AlreadyExistsError,
  type NewerChange,
  StaleBaseError,
  StaleShaError,
} from "./errors.js";
import type {
  Change,
  Changeset,
  CommitMessage,
  CommitStorage,
  StorageFile,
  StorageWriteResult,
} from "./types.js";

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
  return withTrailer(`${verb} ${path}`, [], editor);
}

function describeChange(change: Change): string {
  if (change.type === "write") return `Update ${change.path}`;
  if (change.type === "delete") return `Delete ${change.path}`;
  return `${folderOf(change.from) === folderOf(change.to) ? "Rename" : "Move"} ${change.from} -> ${change.to}`;
}

/** ADR 0017: one change reads like a single-file commit, a set is "Reorganize <n> items". */
function changesetMessage(
  changeset: Changeset,
  editor: GithubEditor | undefined,
  given?: CommitMessage,
): string {
  if (given) {
    return withTrailer(
      oneLine(given.subject),
      (given.body ?? []).map(oneLine).filter(Boolean),
      editor,
    );
  }
  const [only] = changeset;
  const subject =
    changeset.length === 1 && only
      ? only.type === "rename"
        ? `${folderOf(only.from) === folderOf(only.to) ? "Rename" : "Move"} ${only.from}`
        : describeChange(only)
      : `Reorganize ${changeset.length} items`;
  return withTrailer(subject, changeset.map(describeChange), editor);
}

function withTrailer(
  subject: string,
  body: string[],
  editor: GithubEditor | undefined,
): string {
  const lines = [subject, ""];
  if (body.length > 0) lines.push(...body.map((line) => `- ${line}`), "");
  lines.push(TRAILER);
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
 * credential. Each `write`, `create` and `delete` is one commit; `commit`
 * applies a whole changeset as one commit through the Git Data API, and never
 * forces the ref. Create one per
 * request so `editor` names the person who made it.
 */
export function createGithubStorage(
  options: GithubStorageOptions,
): CommitStorage {
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

  let defaultBranch: string | undefined;

  async function branchName(): Promise<string> {
    if (options.branch) return options.branch;
    if (!defaultBranch) {
      const response = await api(repoUrl);
      if (!response.ok) throw await apiError(response);
      defaultBranch = ((await response.json()) as { default_branch: string })
        .default_branch;
    }
    return defaultBranch;
  }

  async function getJson<T>(url: string): Promise<T> {
    const response = await api(url);
    if (!response.ok) throw await apiError(response);
    return (await response.json()) as T;
  }

  async function postJson<T>(url: string, body: unknown): Promise<T> {
    const response = await api(url, { method: "POST", body });
    if (!response.ok) throw await apiError(response);
    return (await response.json()) as T;
  }

  async function headSha(branch: string): Promise<string> {
    const ref = await getJson<{ object: { sha: string } }>(
      `${repoUrl}/git/ref/heads/${encodePath(branch)}`,
    );
    return ref.object.sha;
  }

  const storage: CommitStorage = {
    async base() {
      return headSha(await branchName());
    },

    async changedSince(since) {
      const head = await headSha(await branchName());
      if (head === since) return [];
      const comparison = await getJson<{
        files?: Array<{ filename: string; previous_filename?: string }>;
      }>(
        `${repoUrl}/compare/${encodeURIComponent(since)}...${encodeURIComponent(head)}`,
      );
      const inVault = (path: string) =>
        prefix === ""
          ? path
          : path.startsWith(`${prefix}/`)
            ? path.slice(prefix.length + 1)
            : null;
      const paths = new Set<string>();
      for (const file of comparison.files ?? []) {
        for (const name of [file.filename, file.previous_filename]) {
          const path = name === undefined ? null : inVault(name);
          if (path !== null) paths.add(path);
        }
      }
      return [...paths].sort();
    },

    async commit(changeset, expected, message) {
      const branch = await branchName();
      const head = await headSha(branch);
      if (head !== expected) throw new StaleBaseError(expected);

      const headCommit = await getJson<{ tree: { sha: string } }>(
        `${repoUrl}/git/commits/${head}`,
      );
      const listing = await getJson<{
        truncated: boolean;
        tree: Array<{ path: string; mode: string; type: string; sha: string }>;
      }>(`${repoUrl}/git/trees/${headCommit.tree.sha}?recursive=1`);
      if (listing.truncated) {
        throw new Error("The repo tree is too large to commit through the API");
      }

      // Plan the whole set against the tree before anything is uploaded.
      type Entry = { mode: string; sha?: string; content?: string };
      const original = new Map<string, Entry>();
      for (const item of listing.tree) {
        if (item.type === "blob") {
          original.set(item.path, { mode: item.mode, sha: item.sha });
        }
      }
      const working = new Map(original);
      const touched = new Set<string>();
      for (const change of changeset) {
        if (change.type === "write") {
          const path = repoPath(change.path);
          touched.add(path);
          working.set(path, {
            mode: working.get(path)?.mode ?? "100644",
            content: change.content,
          });
        } else if (change.type === "delete") {
          const path = repoPath(change.path);
          touched.add(path);
          if (!working.delete(path)) throw new StaleShaError(change.path);
        } else {
          const from = repoPath(change.from);
          const to = repoPath(change.to);
          const moved = working.get(from);
          if (!moved) throw new StaleShaError(change.from);
          if (working.has(to)) throw new AlreadyExistsError(change.to);
          touched.add(from);
          touched.add(to);
          working.delete(from);
          working.set(to, moved);
        }
      }

      const entries: Array<{
        path: string;
        mode: string;
        type: "blob";
        sha: string | null;
      }> = [];
      for (const path of touched) {
        const before = original.get(path);
        const after = working.get(path);
        if (!after) {
          if (before) {
            entries.push({ path, mode: before.mode, type: "blob", sha: null });
          }
          continue;
        }
        let sha = after.sha;
        if (after.content !== undefined) {
          sha = (
            await postJson<{ sha: string }>(`${repoUrl}/git/blobs`, {
              content: Buffer.from(after.content, "utf8").toString("base64"),
              encoding: "base64",
            })
          ).sha;
        }
        if (sha !== before?.sha || after.mode !== before?.mode) {
          entries.push({
            path,
            mode: after.mode,
            type: "blob",
            sha: sha ?? null,
          });
        }
      }

      const tree = await postJson<{ sha: string }>(`${repoUrl}/git/trees`, {
        base_tree: headCommit.tree.sha,
        tree: entries,
      });
      const made = await postJson<{ sha: string }>(`${repoUrl}/git/commits`, {
        message: changesetMessage(changeset, options.editor, message),
        tree: tree.sha,
        parents: [head],
      });
      const moved = await api(
        `${repoUrl}/git/refs/heads/${encodePath(branch)}`,
        { method: "PATCH", body: { sha: made.sha, force: false } },
      );
      // Not a fast-forward: another commit landed after the head was read.
      if (moved.status === 422) throw new StaleBaseError(expected);
      if (!moved.ok) throw await apiError(moved);
      return { base: made.sha, commit: made.sha };
    },

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
