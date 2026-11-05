// A fake GitHub for the browser tests: just enough of the OAuth web flow and
// the user API for Better Auth's GitHub sign-in. No real GitHub in CI.
//
//   node e2e/support/fake-github.mjs <port>
//
// - GET  /login/oauth/authorize   a consent page with one link per outcome
// - POST /login/oauth/access_token  exchanges "code-<login>" for "token-<login>"
// - GET  /api/user, /api/user/emails  profile of the token's login
// - GET  /health

import http from "node:http";

const port = Number(process.argv[2] ?? 3105);
const origin = `http://localhost:${port}`;

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
