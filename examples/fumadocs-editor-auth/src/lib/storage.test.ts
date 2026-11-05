import { createFakeContentsApi } from "codemirror-obsidian-md/storage/github-fake";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseEnv } from "./env";
import { createNotesHandler, type NotesEditor } from "./storage";

const baseEnv = {
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
  BETTER_AUTH_URL: "http://localhost:3104",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
  GITHUB_REPO: "owner/wiki",
  GITHUB_TOKEN: "ghp_server_secret",
  GITHUB_API_URL: "https://api.github.test",
};

const ada: NotesEditor = { name: "Ada Lovelace", login: "ada" };

function setup(
  options: { editor?: NotesEditor | null; env?: Record<string, string> } = {},
) {
  const github = createFakeContentsApi({ repo: "owner/wiki" });
  const handler = createNotesHandler({
    env: () => parseEnv({ ...baseEnv, ...options.env }),
    getEditor: async () =>
      options.editor === undefined ? ada : options.editor,
    fetch: github.fetch,
  });
  const call = (method: string, body?: unknown, search = "") =>
    handler(
      new Request(`http://localhost/api/notes${search}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined || method === "GET"
          ? {}
          : { body: JSON.stringify(body) }),
      }),
    );
  return { github, call };
}

afterEach(() => vi.restoreAllMocks());

describe("saving a Note", () => {
  it("makes one Update commit that names the editor from the session", async () => {
    const { github, call } = setup();
    github.seed("Notes/a.md", "one");

    const response = await call("PUT", {
      path: "Notes/a.md",
      content: "two",
      sha: github.shaOf("Notes/a.md"),
    });

    expect(response.status).toBe(200);
    expect(github.files()["Notes/a.md"]).toBe("two");
    expect(github.commits).toHaveLength(1);
    expect(github.commits[0].message).toBe(
      "Update Notes/a.md\n\nEdited-with: obsidian-md editor\nEdited-by: Ada Lovelace (@ada)",
    );
  });

  it("ignores trailers and authorship sent by the client", async () => {
    const { github, call } = setup();
    github.seed("a.md", "one");

    await call("PUT", {
      path: "a.md",
      content: "two",
      sha: github.shaOf("a.md"),
      editor: { name: "Mallory", login: "mallory" },
      message: "Edited-by: Mallory (@mallory)",
    });

    const { message } = github.commits[0];
    expect(message).toContain("Edited-by: Ada Lovelace (@ada)");
    expect(message).not.toContain("mallory");
  });

  it("adds no email, Co-authored-by or skip marker", async () => {
    const { github, call } = setup();
    github.seed("a.md", "one");
    await call("PUT", {
      path: "a.md",
      content: "two",
      sha: github.shaOf("a.md"),
    });
    const { message } = github.commits[0];
    expect(message).not.toMatch(/@[\w.-]+\.\w+|co-authored-by|\[skip/i);
  });

  it("answers a stale SHA with the newer change", async () => {
    const { github, call } = setup();
    github.seed("a.md", "one");
    const stale = github.shaOf("a.md");
    github.externalWrite("a.md", "theirs", { name: "Bob", login: "bob" });

    const response = await call("PUT", {
      path: "a.md",
      content: "mine",
      sha: stale,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "stale-sha",
      newer: { author: "Bob (@bob)" },
    });
    expect(github.files()["a.md"]).toBe("theirs");
  });
});

describe("creating and deleting a Note", () => {
  it("creates with one Create commit", async () => {
    const { github, call } = setup();
    const response = await call("POST", { path: "New.md", content: "hi" });

    expect(response.status).toBe(200);
    expect(github.files()["New.md"]).toBe("hi");
    expect(github.commits).toHaveLength(1);
    expect(github.commits[0].message).toMatch(/^Create New\.md\n\n/);
    expect(github.commits[0].message).toContain(
      "Edited-by: Ada Lovelace (@ada)",
    );
  });

  it("refuses to create over an existing Note", async () => {
    const { github, call } = setup();
    github.seed("a.md", "one");
    const response = await call("POST", { path: "a.md", content: "x" });
    expect(response.status).toBe(422);
    expect(github.commits).toHaveLength(0);
  });

  it("deletes with one Delete commit", async () => {
    const { github, call } = setup();
    github.seed("a.md", "one");
    const response = await call("DELETE", {
      path: "a.md",
      sha: github.shaOf("a.md"),
    });

    expect(response.status).toBe(200);
    expect(github.files()).toEqual({});
    expect(github.commits).toHaveLength(1);
    expect(github.commits[0].message).toMatch(/^Delete a\.md\n\n/);
  });

  it("uses the Vault-relative path under VAULT_PATH", async () => {
    const { github, call } = setup({ env: { VAULT_PATH: "docs/vault" } });
    await call("POST", { path: "New.md", content: "hi" });
    expect(Object.keys(github.files())).toEqual(["docs/vault/New.md"]);
    expect(github.commits[0].message).toMatch(/^Create New\.md\n/);
  });
});

describe("reading a Note", () => {
  it("returns the content and SHA", async () => {
    const { github, call } = setup();
    github.seed("a.md", "one");
    const response = await call("GET", undefined, "?path=a.md");
    expect(await response.json()).toEqual({
      content: "one",
      sha: github.shaOf("a.md"),
    });
  });
});

describe("a signed-out request", () => {
  it.each(["GET", "PUT", "POST", "DELETE"])(
    "is rejected on %s",
    async (method) => {
      const { github, call } = setup({ editor: null });
      github.seed("a.md", "one");
      const response = await call(
        method,
        { path: "a.md", content: "x", sha: github.shaOf("a.md") },
        "?path=a.md",
      );
      expect(response.status).toBe(401);
      expect(github.requests).toHaveLength(0);
      expect(github.commits).toHaveLength(0);
    },
  );
});

describe("a path outside the Vault", () => {
  it.each(["../secret.md", "/etc/passwd", "a/../../b.md"])(
    "%s is rejected",
    async (path) => {
      const { github, call } = setup();
      const response = await call("POST", { path, content: "x" });
      expect(response.status).toBe(400);
      expect(github.requests).toHaveLength(0);
    },
  );
});

describe("a credential failure", () => {
  it("returns a generic error and logs the details only on the server", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createNotesHandler({
      env: () => parseEnv(baseEnv),
      getEditor: async () => ada,
      fetch: (async () =>
        new Response(JSON.stringify({ message: "Bad credentials" }), {
          status: 401,
        })) as typeof fetch,
    });

    const response = await handler(
      new Request("http://localhost/api/notes", {
        method: "POST",
        body: JSON.stringify({ path: "a.md", content: "x" }),
      }),
    );

    const text = await response.text();
    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "storage-failed" });
    expect(text).not.toMatch(/Bad credentials|ghp_server_secret|401/);
    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[1])).toContain("Bad credentials");
  });

  it("is generic when no credential is configured", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { call } = setup({ env: { GITHUB_TOKEN: "" } });
    const response = await call("POST", { path: "a.md", content: "x" });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "storage-failed" });
    expect(error).toHaveBeenCalled();
  });
});
