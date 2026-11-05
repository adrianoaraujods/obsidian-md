// A fake GitHub for the browser tests: just enough of the OAuth web flow and
// the user API for Better Auth's GitHub sign-in. No real GitHub in CI.
//
// - GET  /login/oauth/authorize   a consent page with one link per outcome
// - POST /login/oauth/access_token  exchanges "code-<login>" for "token-<login>"
// - GET  /api/user, /api/user/emails  profile of the token's login
// - GET  /health
//
// It is also the repo the editor saves to: `/api/repos/...` is the adapter's
// in-memory Contents API (`createFakeContentsApi`), seeded with the fixture
// Vault's Notes under the repo's Vault subdirectory.
//
// - /api/repos/*, /api/app/*      the Contents API (any token is accepted,
//                                  unless "reject token" is on: then 401)
// - POST /__test/reset            reseed the Notes, drop commits, accept tokens
// - POST /__test/reject-token     {on: boolean} answer the Contents API with 401
// - POST /__test/external-write   {path, content, author: {name, login, date?}}
//                                  a commit made by somebody else (Vault-relative path)
// - GET  /__test/state            {files, commits, shas} (repo paths)
//
//   node e2e/support/fake-github.mjs <port> [vaultDir] [repo] [vaultPath]

import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { createFakeContentsApi } from "codemirror-obsidian-md/storage/github-fake";

const port = Number(process.argv[2] ?? 3105);
const vaultDir = process.argv[3] ?? "tests/fixtures/vault";
const repo = process.argv[4] ?? "acme/wiki";
const vaultPath = process.argv[5] ?? "tests/fixtures/vault";
const origin = `http://localhost:${port}`;

let github;
let rejectToken = false;

function reset() {
  github = createFakeContentsApi({
    repo,
    branch: "main",
    baseUrl: `${origin}/api`,
  });
  rejectToken = false;
  for (const name of fs.readdirSync(vaultDir)) {
    if (!name.endsWith(".md")) continue;
    github.seed(
      `${vaultPath}/${name}`,
      fs.readFileSync(path.join(vaultDir, name), "utf8"),
    );
  }
}
reset();

async function forwardToContentsApi(req, res, url) {
  if (rejectToken) {
    return json(res, 401, { message: "Bad credentials" });
  }
  const body = await readBody(req);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    ...(["GET", "HEAD"].includes(req.method ?? "GET") ? {} : { body }),
  });
  const response = await github.fetch(request);
  res.writeHead(response.status, {
    "content-type": response.headers.get("content-type") ?? "application/json",
  });
  res.end(await response.text());
}

const LOGINS = ["octocat", "blocked-user"];

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function loginOf(request) {
  const header = request.headers.authorization ?? "";
  return header.replace(/^Bearer token-/, "") || null;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, origin);

  if (url.pathname === "/health") return json(res, 200, { ok: true });

  if (url.pathname.startsWith("/__test/")) {
    if (url.pathname === "/__test/state") {
      const files = github.files();
      return json(res, 200, {
        files,
        commits: github.commits,
        shas: Object.fromEntries(
          Object.keys(files).map((file) => [file, github.shaOf(file)]),
        ),
      });
    }
    if (req.method !== "POST") return json(res, 405, {});
    const body = JSON.parse((await readBody(req)) || "{}");
    if (url.pathname === "/__test/reset") reset();
    else if (url.pathname === "/__test/reject-token") rejectToken = body.on;
    else if (url.pathname === "/__test/external-write") {
      github.externalWrite(
        `${vaultPath}/${body.path}`,
        body.content,
        body.author,
      );
    } else return json(res, 404, {});
    return json(res, 200, { ok: true });
  }

  if (
    url.pathname.startsWith("/api/repos/") ||
    url.pathname.startsWith("/api/app/")
  ) {
    return forwardToContentsApi(req, res, url.href);
  }

  if (url.pathname === "/login/oauth/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    const target = (params) => {
      const next = new URL(redirectUri);
      next.searchParams.set("state", state);
      for (const [key, value] of Object.entries(params)) {
        next.searchParams.set(key, value);
      }
      return next.href;
    };
    const links = [
      ...LOGINS.map(
        (login) =>
          `<li><a href="${target({ code: `code-${login}` })}">Authorize as ${login}</a></li>`,
      ),
      `<li><a href="${target({ error: "access_denied" })}">Cancel</a></li>`,
    ];
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      `<!doctype html><title>Authorize (fake GitHub)</title><h1>Authorize application</h1><ul>${links.join("")}</ul>`,
    );
    return;
  }

  if (url.pathname === "/login/oauth/access_token" && req.method === "POST") {
    const form = new URLSearchParams(await readBody(req));
    const code = form.get("code") ?? "";
    if (!code.startsWith("code-")) {
      return json(res, 200, { error: "bad_verification_code" });
    }
    return json(res, 200, {
      access_token: `token-${code.slice("code-".length)}`,
      token_type: "bearer",
      scope: "read:user,user:email",
    });
  }

  if (url.pathname === "/api/user") {
    const login = loginOf(req);
    if (!login) return json(res, 401, { message: "Bad credentials" });
    return json(res, 200, {
      id: LOGINS.indexOf(login) + 1000,
      login,
      name: login === "octocat" ? "The Octocat" : "Blocked User",
      email: null,
      avatar_url: `${origin}/avatar/${login}.svg`,
    });
  }

  if (url.pathname === "/api/user/emails") {
    const login = loginOf(req);
    if (!login) return json(res, 401, { message: "Bad credentials" });
    return json(res, 200, [
      { email: `${login}@example.com`, primary: true, verified: true },
    ]);
  }

  if (url.pathname.startsWith("/avatar/")) {
    res.writeHead(200, { "content-type": "image/svg+xml" });
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="12" fill="#888"/></svg>',
    );
    return;
  }

  json(res, 404, { message: "Not Found" });
});

server.listen(port, () => console.log(`fake GitHub on ${origin}`));
