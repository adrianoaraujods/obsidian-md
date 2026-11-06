import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runStorageContract } from "../../src/storage/contract.js";
import { createFilesystemStorage } from "../../src/storage/filesystem.js";

async function tempVault() {
  const root = await mkdtemp(join(tmpdir(), "cm-obsidian-fs-"));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

runStorageContract("filesystem adapter", async () => {
  const { root, cleanup } = await tempVault();
  return { storage: createFilesystemStorage({ root }), cleanup };
});

describe("filesystem adapter specifics", () => {
  it("has no lock capability", async () => {
    const { root, cleanup } = await tempVault();
    try {
      expect(createFilesystemStorage({ root }).lock).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("returns a content hash as the SHA", async () => {
    const { root, cleanup } = await tempVault();
    try {
      const storage = createFilesystemStorage({ root });
      const a = await storage.create("a.md", "same");
      const b = await storage.create("b.md", "same");
      const c = await storage.create("c.md", "different");
      expect(a.sha).toBe(b.sha);
      expect(a.sha).not.toBe(c.sha);
      expect(a.sha).toBe("ff3390557335ba88d37755e41514beb03bc499ec");
    } finally {
      await cleanup();
    }
  });

  it("detects a file changed on disk outside the adapter", async () => {
    const { root, cleanup } = await tempVault();
    try {
      const storage = createFilesystemStorage({ root });
      const { sha } = await storage.create("n.md", "one");
      await writeFile(join(root, "n.md"), "edited elsewhere");
      await expect(storage.write("n.md", "two", sha)).rejects.toMatchObject({
        code: "stale-sha",
      });
      expect(await readFile(join(root, "n.md"), "utf8")).toBe(
        "edited elsewhere",
      );
    } finally {
      await cleanup();
    }
  });

  it("refuses paths that escape the root", async () => {
    const { root, cleanup } = await tempVault();
    try {
      const storage = createFilesystemStorage({ root });
      await expect(storage.create("../evil.md", "x")).rejects.toThrow(
        /outside/i,
      );
      await expect(storage.read("/etc/passwd")).rejects.toThrow(/outside/i);
    } finally {
      await cleanup();
    }
  });
});
