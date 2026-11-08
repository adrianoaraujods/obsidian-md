import { createFakeContentsApi } from "codemirror-obsidian-md/storage/github-fake";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseEnv } from "./env";
import { createManageHandler } from "./manage";
import type { NotesEditor } from "./storage";

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

function setup(options: { editor?: NotesEditor | null } = {}) {
  const github = createFakeContentsApi({ repo: "owner/wiki" });
  github.seed("a.md", "A [[b]]");
  github.seed("b.md", "B");
  const handler = createManageHandler({
    env: () => parseEnv(baseEnv),
    getEditor: async () =>
      options.editor === undefined ? ada : options.editor,
    fetch: github.fetch,
  });
  const post = (body: unknown) =>
    handler(
      new Request("http://localhost/api/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  return { github, post };
}

afterEach(() => vi.restoreAllMocks());

describe("applying a reorganization", () => {
  it("makes one commit with the subject, body and a trailer built from the session", async () => {
    const { github, post } = setup();
    const before = github.commits.length;

    const response = await post({
      base: github.head(),
      changeset: [
        { type: "rename", from: "b.md", to: "Moved/b.md" },
        { type: "write", path: "a.md", content: "A [[Moved/b]]" },
      ],
      subject: "Move b.md",
      body: ["Update 1 link(s) in a.md"],
      editor: { name: "Mallory", login: "mallory" },
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.base).toBe(github.head());
    expect(result.rebased).toBeUndefined();
    expect(github.commits).toHaveLength(before + 1);
    expect(github.files()["Moved/b.md"]).toBe("B");
    expect(github.files()["a.md"]).toBe("A [[Moved/b]]");
    expect(github.commits.at(-1)?.message).toBe(
      "Move b.md\n\n- Update 1 link(s) in a.md\n\nEdited-with: obsidian-md editor\nEdited-by: Ada Lovelace (@ada)",
    );
  });

  it("refuses a signed-out request", async () => {
    const { github, post } = setup({ editor: null });
    const response = await post({ base: github.head(), changeset: [] });
    expect(response.status).toBe(401);
    expect(github.commits).toHaveLength(0);
  });

  it("refuses a path outside the Vault", async () => {
    const { github, post } = setup();
    for (const change of [
      { type: "write", path: "../x.md", content: "x" },
      { type: "rename", from: "a.md", to: "/etc/x.md" },
      { type: "delete", path: "a/../../b.md" },
    ]) {
      const response = await post({
        base: github.head(),
        changeset: [change],
      });
      expect(response.status).toBe(400);
    }
    expect(github.commits).toHaveLength(0);
  });

  it("asks for a reload (409) when a commit that landed touched a file in the changeset, and changes nothing", async () => {
    const { github, post } = setup();
    const base = github.head();
    github.externalWrite("b.md", "B by Bob", { name: "Bob", login: "bob" });
    const before = github.commits.length;
    const response = await post({
      base,
      changeset: [{ type: "rename", from: "b.md", to: "c2.md" }],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "stale-base" });
    expect(github.files()["b.md"]).toBe("B by Bob");
    expect(github.commits).toHaveLength(before);
  });

  it("rebases onto a commit that landed when it touched an unrelated non-Note file", async () => {
    const { github, post } = setup();
    const base = github.head();
    github.externalWrite("logo.png", "PNG", { name: "Bob", login: "bob" });
    const landed = github.head();
    const response = await post({
      base,
      changeset: [
        { type: "rename", from: "b.md", to: "Moved/b.md" },
        { type: "write", path: "a.md", content: "A [[Moved/b]]" },
      ],
      subject: "Move b.md",
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.base).toBe(github.head());
    // The client never loaded what landed, so it must reload before applying again.
    expect(result.rebased).toBe(true);
    expect(github.files()["logo.png"]).toBe("PNG");
    expect(github.files()["Moved/b.md"]).toBe("B");
    expect(github.commits.at(-1)?.message).toContain("Move b.md");
    expect(github.head()).not.toBe(landed);
  });

  it("refuses to rebase over any Note, since the link rewrites were computed from the Notes we read", async () => {
    const { github, post } = setup();
    const base = github.head();
    // Bob links to the Note we are about to move, in a Note we did not write.
    github.externalWrite("c.md", "C [[b]]", { name: "Bob", login: "bob" });
    const before = github.commits.length;
    const response = await post({
      base,
      changeset: [
        { type: "rename", from: "b.md", to: "Moved/b.md" },
        { type: "write", path: "a.md", content: "A [[Moved/b]]" },
      ],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "stale-base" });
    expect(github.files()["b.md"]).toBe("B");
    expect(github.commits).toHaveLength(before);
  });

  it("refuses to rebase over a file added inside a folder the changeset moves", async () => {
    const { github, post } = setup();
    github.seed("Dir/n.md", "N");
    const base = github.head();
    github.externalWrite("Dir/img.png", "PNG", { name: "Bob", login: "bob" });
    const before = github.commits.length;
    const response = await post({
      base,
      changeset: [{ type: "rename", from: "Dir/n.md", to: "Other/n.md" }],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "stale-base" });
    expect(github.files()["Dir/n.md"]).toBe("N");
    expect(github.commits).toHaveLength(before);
  });

  it("refuses to rebase over a meta.json change inside a moved folder", async () => {
    const { github, post } = setup();
    github.seed("Dir/n.md", "N");
    github.seed("Dir/meta.json", "{}");
    const base = github.head();
    github.externalWrite("Dir/meta.json", '{"title":"Bob"}', {
      name: "Bob",
      login: "bob",
    });
    const response = await post({
      base,
      changeset: [
        { type: "rename", from: "Dir/n.md", to: "Other/n.md" },
        { type: "rename", from: "Dir/meta.json", to: "Other/meta.json" },
      ],
    });
    expect(response.status).toBe(409);
  });

  it("treats the destination of a rename as touched", async () => {
    const { github, post } = setup();
    const base = github.head();
    github.externalWrite("d.md", "D", { name: "Bob", login: "bob" });
    const response = await post({
      base,
      changeset: [{ type: "rename", from: "b.md", to: "d.md" }],
    });
    expect(response.status).toBe(409);
    expect(github.files()["b.md"]).toBe("B");
  });

  it("reports an existing path as 422", async () => {
    const { github, post } = setup();
    const response = await post({
      base: github.head(),
      changeset: [{ type: "rename", from: "b.md", to: "a.md" }],
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "already-exists",
      path: "a.md",
    });
  });

  it.each([401, 403])(
    "answers a refused credential (%i) with a generic storage-failed",
    async (status) => {
      const { github } = setup();
      const base = github.head();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const handler = createManageHandler({
        env: () => parseEnv(baseEnv),
        getEditor: async () => ada,
        fetch: async () =>
          new Response(JSON.stringify({ message: "Bad credentials" }), {
            status,
          }),
      });
      const response = await handler(
        new Request("http://localhost/api/manage", {
          method: "POST",
          body: JSON.stringify({ base, changeset: [] }),
        }),
      );
      const text = await response.text();
      expect(response.status).toBe(500);
      expect(JSON.parse(text)).toEqual({ error: "storage-failed" });
      expect(text).not.toMatch(/Bad credentials|ghp_server_secret/);
      expect(error).toHaveBeenCalled();
    },
  );

  it("answers any other storage failure with commit-failed, not the credential error", async () => {
    const { github } = setup();
    const base = github.head();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createManageHandler({
      env: () => parseEnv(baseEnv),
      getEditor: async () => ada,
      fetch: async () =>
        new Response(JSON.stringify({ message: "Server Error" }), {
          status: 500,
        }),
    });
    const response = await handler(
      new Request("http://localhost/api/manage", {
        method: "POST",
        body: JSON.stringify({ base, changeset: [] }),
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "commit-failed" });
    expect(error).toHaveBeenCalled();
  });
});
