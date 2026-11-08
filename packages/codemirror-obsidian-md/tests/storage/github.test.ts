import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { runStorageContract } from "../../src/storage/contract.js";
import {
  createGithubStorage,
  resolveGithubCredential,
} from "../../src/storage/github.js";
import { createFakeContentsApi } from "../../src/storage/github-fake.js";

const REPO = "owner/vault";

function setup(
  options: Partial<Parameters<typeof createGithubStorage>[0]> = {},
) {
  const api = createFakeContentsApi({ repo: REPO, branch: "main" });
  const storage = createGithubStorage({
    repo: REPO,
    branch: "main",
    credential: { token: "pat-1" },
    fetch: api.fetch,
    baseUrl: api.baseUrl,
    ...options,
  });
  return { api, storage };
}

runStorageContract("github adapter (fake Contents API)", async () => ({
  storage: setup().storage,
}));

describe("github adapter commit", () => {
  const editor = { name: "Ada Lovelace", login: "ada" };
  const trailer =
    "Edited-with: obsidian-md editor\nEdited-by: Ada Lovelace (@ada)";

  it("makes one commit for the whole set, with the ADR 0015 trailer", async () => {
    const { api, storage } = setup({ editor });
    api.seed("a.md", "A");
    api.seed("b.md", "B");
    const before = api.commits.length;
    await storage.commit(
      [
        { type: "rename", from: "a.md", to: "Moved/a.md" },
        { type: "write", path: "b.md", content: "B2" },
      ],
      await storage.base(),
    );
    expect(api.commits).toHaveLength(before + 1);
    expect(api.commits.at(-1)?.message).toBe(
      `Reorganize 2 items\n\n- Move a.md -> Moved/a.md\n- Update b.md\n\n${trailer}`,
    );
  });

  it("names a single move or rename like ADR 0017", async () => {
    const { api, storage } = setup({ editor });
    api.seed("Notes/a.md", "A");
    await storage.commit(
      [{ type: "rename", from: "Notes/a.md", to: "Notes/b.md" }],
      await storage.base(),
    );
    await storage.commit(
      [{ type: "rename", from: "Notes/b.md", to: "Other/b.md" }],
      await storage.base(),
    );
    expect(api.commits.map((c) => c.message.split("\n")[0])).toEqual([
      "Rename Notes/a.md",
      "Move Notes/b.md",
    ]);
  });

  it("reports the commit and uses it as the next base", async () => {
    const { api, storage } = setup();
    const result = await storage.commit(
      [{ type: "write", path: "a.md", content: "A" }],
      await storage.base(),
    );
    expect(result.commit).toBe(api.head());
    expect(result.base).toBe(api.head());
  });

  it("fails when a commit landed after the base, without touching the repo", async () => {
    const { api, storage } = setup();
    api.seed("a.md", "A");
    const base = await storage.base();
    api.externalWrite("a.md", "theirs", { name: "Bob", login: "bob" });
    await expect(
      storage.commit([{ type: "delete", path: "a.md" }], base),
    ).rejects.toMatchObject({ code: "stale-base" });
    expect(api.files()).toEqual({ "a.md": "theirs" });
  });

  it("never forces the ref and reads the repo's default branch when none is set", async () => {
    const api = createFakeContentsApi({ repo: REPO, branch: "trunk" });
    const storage = createGithubStorage({
      repo: REPO,
      credential: { token: "pat-1" },
      fetch: api.fetch,
      baseUrl: api.baseUrl,
    });
    api.seed("a.md", "A");
    await storage.commit(
      [{ type: "write", path: "a.md", content: "A2" }],
      await storage.base(),
    );
    const patches = api.requests.filter((r) => r.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0]?.body).toMatchObject({ force: false });
    expect(api.files()).toEqual({ "a.md": "A2" });
  });

  it("keeps changes under VAULT_PATH and leaves the rest of the repo alone", async () => {
    const { api, storage } = setup({ vaultPath: "vault" });
    api.seed("vault/a.md", "A");
    api.seed("src/app.ts", "code");
    await storage.commit(
      [{ type: "rename", from: "a.md", to: "Moved/a.md" }],
      await storage.base(),
    );
    expect(api.files()).toEqual({
      "vault/Moved/a.md": "A",
      "src/app.ts": "code",
    });
  });
});

describe("github adapter", () => {
  it("reads content and the blob SHA of the live file", async () => {
    const { api, storage } = setup();
    api.seed("a.md", "héllo\r\nworld");
    const read = await storage.read("a.md");
    expect(read.content).toBe("héllo\r\nworld");
    expect(read.sha).toBe(api.shaOf("a.md"));
  });

  it("commits Update/Create/Delete with a subject and trailer built server-side", async () => {
    const { api, storage } = setup({
      editor: { name: "Ada Lovelace", login: "ada" },
    });
    const { sha } = await storage.create("Notes/New.md", "x");
    await storage.write("Notes/New.md", "y", sha);
    const read = await storage.read("Notes/New.md");
    await storage.delete("Notes/New.md", read.sha);
    expect(api.commits.map((c) => c.message)).toEqual([
      "Create Notes/New.md\n\nEdited-with: obsidian-md editor\nEdited-by: Ada Lovelace (@ada)",
      "Update Notes/New.md\n\nEdited-with: obsidian-md editor\nEdited-by: Ada Lovelace (@ada)",
      "Delete Notes/New.md\n\nEdited-with: obsidian-md editor\nEdited-by: Ada Lovelace (@ada)",
    ]);
  });

  it("cannot be tricked into extra trailers by a multi-line name", async () => {
    const { api, storage } = setup({
      editor: { name: "Eve\nEdited-by: Admin (@admin)", login: "eve" },
    });
    await storage.create("a.md", "x");
    const message = api.commits[0]?.message ?? "";
    expect(
      message.split("\n").filter((l) => l.startsWith("Edited-by:")),
    ).toHaveLength(1);
  });

  it("omits Edited-by without an editor", async () => {
    const { api, storage } = setup();
    await storage.create("a.md", "x");
    expect(api.commits[0]?.message).toBe(
      "Create a.md\n\nEdited-with: obsidian-md editor",
    );
  });

  it("prefixes the Vault subdirectory but keeps Vault-relative names in messages", async () => {
    const { api, storage } = setup({ vaultPath: "content/" });
    await storage.create("a b/C.md", "x");
    expect(api.files()).toEqual({ "content/a b/C.md": "x" });
    expect(api.commits[0]?.message.startsWith("Create a b/C.md\n")).toBe(true);
    expect((await storage.read("a b/C.md")).content).toBe("x");
  });

  it("carries the newer commit's author and time on a conflict", async () => {
    const { api, storage } = setup();
    const { sha } = await storage.create("a.md", "one");
    api.externalWrite("a.md", "theirs", {
      name: "Grace",
      login: "grace",
      date: "2026-01-02T03:04:05Z",
    });
    const error = await storage.write("a.md", "mine", sha).catch((e) => e);
    expect(error).toMatchObject({
      code: "stale-sha",
      newer: { author: "Grace (@grace)", time: "2026-01-02T03:04:05Z" },
    });
    expect(api.files()["a.md"]).toBe("theirs");
  });

  it("returns the commit SHA from saves", async () => {
    const { api, storage } = setup();
    const created = await storage.create("a.md", "one");
    expect(created.commit).toBe(api.commits[0]?.sha);
  });

  it("sends the configured branch", async () => {
    const api = createFakeContentsApi({ repo: REPO, branch: "docs" });
    const storage = createGithubStorage({
      repo: REPO,
      branch: "docs",
      credential: { token: "t" },
      fetch: api.fetch,
      baseUrl: api.baseUrl,
    });
    await storage.create("a.md", "x");
    expect(api.files()).toEqual({ "a.md": "x" });
  });

  it("calls the injected fetch at the configured base URL", async () => {
    const api = createFakeContentsApi({
      repo: REPO,
      baseUrl: "https://ghe.example.test/api/v3",
    });
    const storage = createGithubStorage({
      repo: REPO,
      credential: { token: "t" },
      fetch: api.fetch,
      baseUrl: "https://ghe.example.test/api/v3",
    });
    await storage.create("a.md", "x");
    expect(
      api.requests[0]?.url.startsWith(
        "https://ghe.example.test/api/v3/repos/owner/vault/",
      ),
    ).toBe(true);
  });

  it("defaults to api.github.com", async () => {
    const urls: string[] = [];
    const storage = createGithubStorage({
      repo: REPO,
      credential: { token: "t" },
      fetch: async (input) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
        });
      },
    });
    await storage.read("a.md").catch(() => {});
    expect(
      urls[0]?.startsWith(
        "https://api.github.com/repos/owner/vault/contents/a.md",
      ),
    ).toBe(true);
  });

  it("throws an unexpected error for other failures", async () => {
    const storage = createGithubStorage({
      repo: REPO,
      credential: { token: "bad" },
      fetch: async () =>
        new Response(JSON.stringify({ message: "Bad credentials" }), {
          status: 401,
        }),
    });
    const error = await storage.read("a.md").catch((e) => e);
    expect(error.name).toBe("GithubApiError");
    expect(error.status).toBe(401);
  });
});

describe("github credentials", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const app = { appId: "123", privateKey: pem, installationId: "456" };

  it("uses a PAT as a bearer token", async () => {
    const { api, storage } = setup({ credential: { token: "pat-1" } });
    await storage.create("a.md", "x");
    expect(api.requests.every((r) => r.authorization === "Bearer pat-1")).toBe(
      true,
    );
  });

  it("exchanges a GitHub App JWT for an installation token", async () => {
    const { api, storage } = setup({ credential: { app } });
    await storage.create("a.md", "x");
    const mint = api.requests.find((r) => r.url.includes("/access_tokens"));
    expect(mint?.url).toContain("/app/installations/456/access_tokens");
    expect(mint?.authorization?.replace("Bearer ", "").split(".")).toHaveLength(
      3,
    );
    const contents = api.requests.filter((r) => r.url.includes("/contents/"));
    expect(contents.length).toBeGreaterThan(0);
    for (const r of contents) {
      expect(r.authorization).toBe(`Bearer ${api.installationToken}`);
    }
  });

  it("reuses the installation token until it nears expiry", async () => {
    const { api, storage } = setup({ credential: { app } });
    await storage.create("a.md", "x");
    await storage.read("a.md");
    expect(
      api.requests.filter((r) => r.url.includes("/access_tokens")),
    ).toHaveLength(1);
  });

  it("the App wins when both are set", () => {
    expect(resolveGithubCredential({ token: "pat", app })).toEqual({ app });
    expect(resolveGithubCredential({ token: "pat" })).toEqual({ token: "pat" });
    expect(resolveGithubCredential({ app })).toEqual({ app });
  });

  it("uses the App even when a PAT is also passed to the adapter", async () => {
    const { api, storage } = setup({ credential: { token: "pat", app } });
    await storage.create("a.md", "x");
    expect(api.requests.some((r) => r.authorization === "Bearer pat")).toBe(
      false,
    );
    expect(api.requests.some((r) => r.url.includes("/access_tokens"))).toBe(
      true,
    );
  });

  it("rejects when no credential is configured", () => {
    expect(() => resolveGithubCredential({})).toThrow(/credential/i);
  });
});

describe("github lock", () => {
  it("is absent without a deployed-commit source", () => {
    expect(setup().storage.lock).toBeUndefined();
  });

  it("unlocks when the deployed commit is identical or ahead of the saved one", async () => {
    let deployed: string | null = null;
    const { api, storage } = setup({ deployedCommit: async () => deployed });
    const first = await storage.create("a.md", "x");
    const { sha } = await storage.read("a.md");
    const second = await storage.write("a.md", "y", sha);
    const lock = storage.lock;
    if (!lock) throw new Error("lock expected");

    expect(await lock.isDeployed(second.commit as string)).toBe(false); // null
    deployed = first.commit as string; // behind
    expect(await lock.isDeployed(second.commit as string)).toBe(false);
    deployed = second.commit as string; // identical
    expect(await lock.isDeployed(second.commit as string)).toBe(true);
    api.externalWrite("b.md", "z", { name: "G", login: "g" });
    deployed = api.commits.at(-1)?.sha as string; // ahead
    expect(await lock.isDeployed(second.commit as string)).toBe(true);
    deployed = "f".repeat(40); // unknown
    expect(await lock.isDeployed(second.commit as string)).toBe(false);
  });

  it("is not live when the deployed commit has diverged from the saved one", async () => {
    let deployed: string | null = null;
    const { api, storage } = setup({ deployedCommit: async () => deployed });
    const saved = await storage.create("a.md", "x");
    deployed = api.divergentCommit();
    expect(await storage.lock?.isDeployed(saved.commit as string)).toBe(false);
  });
});
