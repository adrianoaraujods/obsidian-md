import { createHash } from "node:crypto";

export interface FakeContentsApiOptions {
  /** `owner/name`. Requests for any other repo get a 404. */
  repo: string;
  /** The only branch that exists (and the default branch). Default `main`. */
  branch?: string;
  /** Default `https://api.github.test`. */
  baseUrl?: string;
}

export interface FakeAuthor {
  name: string;
  login: string;
  /** ISO 8601. Default: now. */
  date?: string;
}

export interface FakeCommit {
  sha: string;
  message: string;
  /** The first path the commit changed, or `""`. */
  path: string;
  /** Every path the commit changed. */
  paths: string[];
  author: FakeAuthor & { date: string };
}

export interface FakeRequest {
  method: string;
  url: string;
  authorization: string | null;
  /** Parsed JSON body, when the request had one. */
  body?: unknown;
}

export interface FakeContentsApi {
  /** Pass as the `fetch` option of the GitHub storage (or wrap in a server). */
  fetch: typeof fetch;
  baseUrl: string;
  /** Every request received, in order. */
  requests: FakeRequest[];
  /** Every commit made, oldest first. */
  commits: FakeCommit[];
  /** The token `POST /app/installations/:id/access_tokens` hands out. */
  installationToken: string;
  /** Put a file in the repo without making a commit. */
  seed(path: string, content: string): void;
  /** Make a commit the way another person would, bypassing the adapter. */
  externalWrite(path: string, content: string, author: FakeAuthor): void;
  /**
   * A commit that exists off the branch (a fork, a force-push). Comparing it
   * with any branch commit reports `diverged`. Returns its SHA.
   */
  divergentCommit(): string;
  /** SHA of the branch head, the base a Git Data commit must start from. */
  head(): string;
  /** Blob SHA of a file, as GitHub computes it. */
  shaOf(path: string): string;
  /** Current text of every file, by repo path. */
  files(): Record<string, string>;
}

function blobSha(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * In-memory stand-in for the parts of the GitHub REST API the storage uses,
 * with the same SHA semantics: reading returns the blob SHA, a PUT or DELETE
 * with a stale SHA is a 409, a PUT without a SHA on an existing path is a 422,
 * and each write is one commit. It also serves the Git Data API (blobs, trees,
 * commits, and a ref update that refuses anything but a fast-forward). Intended for tests, including end-to-end ones
 * that wrap `fetch` in an HTTP server.
 */
export function createFakeContentsApi(
  options: FakeContentsApiOptions,
): FakeContentsApi {
  const { repo } = options;
  const branch = options.branch ?? "main";
  const baseUrl = (options.baseUrl ?? "https://api.github.test").replace(
    /\/+$/,
    "",
  );
  const store = new Map<string, string>();
  const commits: FakeCommit[] = [];
  const divergent = new Set<string>();
  const requests: FakeRequest[] = [];
  const installationToken = "ghs_fake_installation_token";
  let counter = 0;

  const rootSha = createHash("sha1").update("root commit").digest("hex");
  const blobs = new Map<string, string>();
  const trees = new Map<string, Map<string, string>>();
  /** Commits made with the Git Data API that no ref points at yet. */
  const pendingTrees = new Map<string, string>();
  const pending = new Map<
    string,
    { message: string; tree: string; parent: string }
  >();

  function head(): string {
    return commits[commits.length - 1]?.sha ?? rootSha;
  }

  function commit(
    path: string,
    message: string,
    author: FakeAuthor,
    paths: string[] = path ? [path] : [],
    sha?: string,
  ) {
    counter += 1;
    const entry: FakeCommit = {
      sha: sha ?? createHash("sha1").update(`commit ${counter}`).digest("hex"),
      message,
      path,
      paths,
      author: { ...author, date: author.date ?? new Date().toISOString() },
    };
    commits.push(entry);
    return entry;
  }

  /** Register the files as a tree (path to blob SHA) and return its SHA. */
  function treeOf(files: Map<string, string>): string {
    const entries = new Map<string, string>();
    for (const [path, content] of files) {
      const sha = blobSha(content);
      blobs.set(sha, content);
      entries.set(path, sha);
    }
    return registerTree(entries);
  }

  function registerTree(entries: Map<string, string>): string {
    const sha = createHash("sha1")
      .update(
        [...entries]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([path, blob]) => `${path}\0${blob}`)
          .join("\n"),
      )
      .digest("hex");
    trees.set(sha, entries);
    return sha;
  }

  const bot: FakeAuthor = { name: "Fake Bot", login: "fake-bot" };

  function contentsPath(rest: string): string | null {
    const prefix = `/repos/${repo}/contents/`;
    if (!rest.startsWith(prefix)) return null;
    return rest
      .slice(prefix.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
  }

  async function handleGitData(
    rest: string,
    request: Request,
    url: URL,
  ): Promise<Response | null> {
    const base = `/repos/${repo}`;
    if (rest === base && request.method === "GET") {
      return json(200, { default_branch: branch });
    }
    const ref = `${base}/git/ref/heads/${branch}`;
    if (rest === ref && request.method === "GET") {
      return json(200, {
        ref: `refs/heads/${branch}`,
        object: { sha: head() },
      });
    }
    const commitMatch = rest.match(new RegExp(`^${base}/git/commits/([^/]+)$`));
    if (commitMatch && request.method === "GET") {
      const sha = commitMatch[1] ?? "";
      if (sha === head()) {
        return json(200, { sha, tree: { sha: treeOf(new Map(store)) } });
      }
      const known = pendingTrees.get(sha);
      if (known) return json(200, { sha, tree: { sha: known } });
      return json(404, { message: "Not Found" });
    }
    const treeMatch = rest.match(new RegExp(`^${base}/git/trees/([^/]+)$`));
    if (treeMatch && request.method === "GET") {
      const entries = trees.get(treeMatch[1] ?? "");
      if (!entries || url.searchParams.get("recursive") !== "1") {
        return json(404, { message: "Not Found" });
      }
      return json(200, {
        sha: treeMatch[1],
        truncated: false,
        tree: [...entries].map(([path, sha]) => ({
          path,
          mode: "100644",
          type: "blob",
          sha,
        })),
      });
    }
    if (rest === `${base}/git/blobs` && request.method === "POST") {
      const body = (await request.json()) as {
        content: string;
        encoding: string;
      };
      if (body.encoding !== "base64") {
        return json(422, { message: "Only base64 is supported here" });
      }
      const text = Buffer.from(body.content, "base64").toString("utf8");
      const sha = blobSha(text);
      blobs.set(sha, text);
      return json(201, { sha });
    }
    if (rest === `${base}/git/trees` && request.method === "POST") {
      const body = (await request.json()) as {
        base_tree?: string;
        tree: Array<{ path: string; mode: string; sha: string | null }>;
      };
      const entries = new Map(
        body.base_tree ? (trees.get(body.base_tree) ?? []) : [],
      );
      for (const entry of body.tree) {
        if (entry.sha === null) entries.delete(entry.path);
        else if (blobs.has(entry.sha)) entries.set(entry.path, entry.sha);
        else return json(422, { message: "Tree references a missing blob" });
      }
      return json(201, { sha: registerTree(entries) });
    }
    if (rest === `${base}/git/commits` && request.method === "POST") {
      const body = (await request.json()) as {
        message: string;
        tree: string;
        parents: string[];
      };
      if (!trees.has(body.tree)) {
        return json(422, { message: "Tree does not exist" });
      }
      counter += 1;
      const sha = createHash("sha1").update(`commit ${counter}`).digest("hex");
      pending.set(sha, {
        message: body.message,
        tree: body.tree,
        parent: body.parents[0] ?? "",
      });
      pendingTrees.set(sha, body.tree);
      return json(201, { sha });
    }
    if (
      rest === ref.replace("/git/ref/", "/git/refs/") &&
      request.method === "PATCH"
    ) {
      const body = (await request.json()) as { sha: string; force?: boolean };
      const target = pending.get(body.sha);
      if (!target) return json(422, { message: "Object does not exist" });
      if (body.force) {
        return json(422, {
          message: "This fake never accepts a forced update",
        });
      }
      if (target.parent !== head()) {
        return json(422, { message: "Update is not a fast forward" });
      }
      const before = new Map(store);
      const after = new Map<string, string>();
      for (const [path, blob] of trees.get(target.tree) ?? []) {
        after.set(path, blobs.get(blob) ?? "");
      }
      store.clear();
      for (const [path, content] of after) store.set(path, content);
      const changed = [...new Set([...before.keys(), ...after.keys()])]
        .filter((path) => before.get(path) !== after.get(path))
        .sort();
      commit(changed[0] ?? "", target.message, bot, changed, body.sha);
      pending.delete(body.sha);
      return json(200, {
        ref: `refs/heads/${branch}`,
        object: { sha: body.sha },
      });
    }
    return null;
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const prefix = new URL(baseUrl).pathname.replace(/\/$/, "");
    const rest = url.pathname.slice(prefix.length);
    const raw = request.method === "GET" ? "" : await request.clone().text();
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {}
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.get("authorization"),
      ...(body === undefined ? {} : { body }),
    });

    const mint = rest.match(/^\/app\/installations\/[^/]+\/access_tokens$/);
    if (mint && request.method === "POST") {
      const token = request.headers.get("authorization") ?? "";
      if (token.replace("Bearer ", "").split(".").length !== 3) {
        return json(401, { message: "A JSON web token could not be decoded" });
      }
      return json(201, {
        token: installationToken,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });
    }

    if (!request.headers.get("authorization")) {
      return json(401, { message: "Requires authentication" });
    }

    const git = await handleGitData(rest, request, url);
    if (git) return git;

    const path = contentsPath(rest);
    if (path !== null) {
      const ref = url.searchParams.get("ref");
      if (request.method === "GET") {
        if (ref && ref !== branch) return json(404, { message: "Not Found" });
        const content = store.get(path);
        if (content === undefined) return json(404, { message: "Not Found" });
        return json(200, {
          type: "file",
          path,
          sha: blobSha(content),
          encoding: "base64",
          // GitHub wraps base64 at 60 columns.
          content: (
            Buffer.from(content, "utf8")
              .toString("base64")
              .match(/.{1,60}/g) ?? []
          ).join("\n"),
        });
      }
      const body = (await request.json()) as {
        message: string;
        content?: string;
        sha?: string;
        branch?: string;
      };
      if (body.branch && body.branch !== branch) {
        return json(404, { message: "Branch not found" });
      }
      const existing = store.get(path);
      if (request.method === "PUT") {
        if (existing !== undefined && !body.sha) {
          return json(422, {
            message: 'Invalid request.\n\n"sha" wasn\'t supplied.',
          });
        }
        if (existing !== undefined && body.sha !== blobSha(existing)) {
          return json(409, {
            message: `${path} does not match ${body.sha}`,
          });
        }
        if (existing === undefined && body.sha) {
          return json(404, { message: "Not Found" });
        }
        const text = Buffer.from(body.content ?? "", "base64").toString("utf8");
        store.set(path, text);
        const made = commit(path, body.message, bot);
        return json(existing === undefined ? 201 : 200, {
          content: { path, sha: blobSha(text) },
          commit: { sha: made.sha, message: made.message },
        });
      }
      if (request.method === "DELETE") {
        if (existing === undefined) return json(404, { message: "Not Found" });
        if (body.sha !== blobSha(existing)) {
          return json(409, { message: `${path} does not match ${body.sha}` });
        }
        store.delete(path);
        const made = commit(path, body.message, bot);
        return json(200, {
          content: null,
          commit: { sha: made.sha, message: made.message },
        });
      }
    }

    if (rest === `/repos/${repo}/commits` && request.method === "GET") {
      const wanted = url.searchParams.get("path");
      const sha = url.searchParams.get("sha");
      if (sha && sha !== branch) return json(404, { message: "Not Found" });
      const latest = [...commits]
        .reverse()
        .find((c) => c.paths.includes(wanted ?? ""));
      return json(
        200,
        latest
          ? [
              {
                sha: latest.sha,
                author: { login: latest.author.login },
                commit: {
                  author: {
                    name: latest.author.name,
                    date: latest.author.date,
                  },
                },
              },
            ]
          : [],
      );
    }

    const compare = rest.match(
      new RegExp(`^/repos/${repo}/compare/([^./]+)\\.\\.\\.([^./]+)$`),
    );
    if (compare && request.method === "GET") {
      const a = compare[1] ?? "";
      const b = compare[2] ?? "";
      if (a === b && divergent.has(a))
        return json(200, { status: "identical" });
      if (divergent.has(a) || divergent.has(b)) {
        const other = divergent.has(a) ? b : a;
        if (!divergent.has(other) && !commits.some((c) => c.sha === other)) {
          return json(404, { message: "Not Found" });
        }
        return json(200, { status: "diverged" });
      }
      const from = a === rootSha ? -1 : commits.findIndex((c) => c.sha === a);
      const to = b === rootSha ? -1 : commits.findIndex((c) => c.sha === b);
      if ((from < 0 && a !== rootSha) || (to < 0 && b !== rootSha))
        return json(404, { message: "Not Found" });
      const status = to === from ? "identical" : to > from ? "ahead" : "behind";
      const files = commits
        .slice(from + 1, to + 1)
        .flatMap((c) => c.paths)
        .map((filename) => ({ filename }));
      return json(200, { status, files });
    }

    return json(404, { message: "Not Found" });
  }

  return {
    fetch: (async (input: string | URL | Request, init?: RequestInit) =>
      handle(new Request(input, init))) as typeof fetch,
    baseUrl,
    requests,
    commits,
    installationToken,
    seed: (path, content) => {
      store.set(path, content);
    },
    externalWrite: (path, content, author) => {
      store.set(path, content);
      commit(path, `Update ${path}`, author);
    },
    divergentCommit: () => {
      const sha = createHash("sha1")
        .update(`divergent ${divergent.size}`)
        .digest("hex");
      divergent.add(sha);
      return sha;
    },
    head,
    shaOf: (path) => {
      const content = store.get(path);
      if (content === undefined) throw new Error(`no such file: ${path}`);
      return blobSha(content);
    },
    files: () => Object.fromEntries(store),
  };
}
