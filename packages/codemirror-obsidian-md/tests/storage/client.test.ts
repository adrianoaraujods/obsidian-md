import { describe, expect, it } from "vitest";

import { createStorageClient } from "../../src/storage/client.js";
import { runStorageContract } from "../../src/storage/contract.js";
import { createGithubStorage } from "../../src/storage/github.js";
import { createFakeContentsApi } from "../../src/storage/github-fake.js";
import { createStorageHandler } from "../../src/storage/http.js";

function setup(withLock = false) {
  const api = createFakeContentsApi({ repo: "o/r" });
  const server = createGithubStorage({
    repo: "o/r",
    credential: { token: "SECRET-TOKEN" },
    fetch: api.fetch,
    baseUrl: api.baseUrl,
    ...(withLock
      ? { deployedCommit: async () => api.commits.at(-1)?.sha ?? null }
      : {}),
  });
  const handler = createStorageHandler(async () => server);
  const sent: Request[] = [];
  const client = createStorageClient({
    url: "https://app.test/api/storage",
    lock: withLock,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      sent.push(request.clone());
      return handler(request);
    },
  });
  return { api, client, sent };
}

runStorageContract(
  "browser fetch adapter -> route handler -> github",
  async () => ({ storage: setup().client }),
);

describe("browser fetch adapter", () => {
  it("never carries a token or credential", async () => {
    const { client, sent } = setup();
    const { sha } = await client.create("a.md", "x");
    await client.write("a.md", "y", sha);
    expect(sent.length).toBeGreaterThan(0);
    for (const request of sent) {
      expect([...request.headers.keys()]).not.toContain("authorization");
      expect(await request.text()).not.toContain("SECRET-TOKEN");
    }
  });

  it("has no lock unless asked, and the lock asks the route handler", async () => {
    expect(setup().client.lock).toBeUndefined();
    const { client } = setup(true);
    const { commit } = await client.create("a.md", "x");
    expect(await client.lock?.isDeployed(commit as string)).toBe(true);
    expect(await client.lock?.isDeployed("0".repeat(40))).toBe(false);
  });

  it("keeps the newer commit's author on a conflict", async () => {
    const { api, client } = setup();
    const { sha } = await client.create("a.md", "x");
    api.externalWrite("a.md", "theirs", {
      name: "Grace",
      login: "grace",
      date: "2026-01-02T03:04:05Z",
    });
    await expect(client.write("a.md", "mine", sha)).rejects.toMatchObject({
      code: "stale-sha",
      newer: { author: "Grace (@grace)", time: "2026-01-02T03:04:05Z" },
    });
  });

  it("turns a route-handler failure into an unexpected error", async () => {
    const client = createStorageClient({
      url: "/api/storage",
      fetch: async () => new Response("boom", { status: 500 }),
    });
    await expect(client.read("a.md")).rejects.toThrow(/500/);
  });
});
