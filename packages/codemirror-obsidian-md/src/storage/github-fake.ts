import { createHash } from "node:crypto";

export interface FakeContentsApiOptions {
  /** `owner/name`. Requests for any other repo get a 404. */
  repo: string;
  /** The only branch that exists. Default `main`. */
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
  path: string;
  author: FakeAuthor & { date: string };
}

export interface FakeRequest {
  method: string;
  url: string;
  authorization: string | null;
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
 * and each write is one commit. Intended for tests, including end-to-end ones
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

  function commit(path: string, message: string, author: FakeAuthor) {
    counter += 1;
    const entry: FakeCommit = {
      sha: createHash("sha1").update(`commit ${counter}`).digest("hex"),
      message,
      path,
      author: { ...author, date: author.date ?? new Date().toISOString() },
    };
    commits.push(entry);
    return entry;
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

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const prefix = new URL(baseUrl).pathname.replace(/\/$/, "");
    const rest = url.pathname.slice(prefix.length);
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.get("authorization"),
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
      const latest = [...commits].reverse().find((c) => c.path === wanted);
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
      const [, a, b] = compare;
      if (a === b && divergent.has(a))
        return json(200, { status: "identical" });
      if (divergent.has(a) || divergent.has(b)) {
        const other = divergent.has(a) ? b : a;
        if (!divergent.has(other) && !commits.some((c) => c.sha === other)) {
          return json(404, { message: "Not Found" });
        }
        return json(200, { status: "diverged" });
      }
      const from = commits.findIndex((c) => c.sha === a);
      const to = commits.findIndex((c) => c.sha === b);
      if (from < 0 || to < 0) return json(404, { message: "Not Found" });
      const status = to === from ? "identical" : to > from ? "ahead" : "behind";
      return json(200, { status });
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
    shaOf: (path) => {
      const content = store.get(path);
      if (content === undefined) throw new Error(`no such file: ${path}`);
      return blobSha(content);
    },
    files: () => Object.fromEntries(store),
  };
}
