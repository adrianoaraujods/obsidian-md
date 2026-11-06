import { afterEach, describe, expect, it } from "vitest";

import type { Storage } from "./types.js";

export interface StorageContractSubject {
  /** A storage over an empty Vault. */
  storage: Storage;
  /** Called after each test to release temp files, servers, etc. */
  cleanup?: () => void | Promise<void>;
}

/**
 * Behavior every storage adapter must have. Call it from a test file with a
 * factory that returns a fresh, empty storage; it registers the tests.
 * Requires `vitest` (an optional peer dependency).
 */
export function runStorageContract(
  name: string,
  createSubject: () => Promise<StorageContractSubject>,
): void {
  describe(`${name} storage contract`, () => {
    const cleanups: Array<() => void | Promise<void>> = [];

    afterEach(async () => {
      for (const cleanup of cleanups.splice(0)) await cleanup();
    });

    async function fresh(): Promise<Storage> {
      const { storage, cleanup } = await createSubject();
      if (cleanup) cleanups.push(cleanup);
      return storage;
    }

    it("creates a Note and reads it back with its SHA", async () => {
      const storage = await fresh();
      const created = await storage.create("Notes/Hello.md", "# Hello\n");
      const read = await storage.read("Notes/Hello.md");
      expect(read.content).toBe("# Hello\n");
      expect(read.sha).toBe(created.sha);
    });

    it("keeps CRLF and a missing trailing newline byte-identical", async () => {
      const storage = await fresh();
      const text = "---\r\ntitle: x\r\n---\r\nbody without newline";
      await storage.create("crlf.md", text);
      expect((await storage.read("crlf.md")).content).toBe(text);
    });

    it("writes with the current SHA and returns a new one", async () => {
      const storage = await fresh();
      const { sha } = await storage.create("a.md", "one");
      const written = await storage.write("a.md", "two", sha);
      const read = await storage.read("a.md");
      expect(read.content).toBe("two");
      expect(written.sha).toBe(read.sha);
      expect(written.sha).not.toBe(sha);
    });

    it("rejects a write with a stale SHA and keeps the stored text", async () => {
      const storage = await fresh();
      const { sha: first } = await storage.create("a.md", "one");
      await storage.write("a.md", "two", first);
      await expect(storage.write("a.md", "mine", first)).rejects.toMatchObject({
        name: "StaleShaError",
        code: "stale-sha",
        path: "a.md",
      });
      expect((await storage.read("a.md")).content).toBe("two");
    });

    it("rejects creating a path that already exists and keeps the text", async () => {
      const storage = await fresh();
      await storage.create("a.md", "original");
      await expect(storage.create("a.md", "other")).rejects.toMatchObject({
        name: "AlreadyExistsError",
        code: "already-exists",
        path: "a.md",
      });
      expect((await storage.read("a.md")).content).toBe("original");
    });

    it("deletes a Note with the current SHA", async () => {
      const storage = await fresh();
      const { sha } = await storage.create("a.md", "one");
      await storage.delete("a.md", sha);
      await expect(storage.read("a.md")).rejects.toThrow();
      // The path is free again.
      await expect(storage.create("a.md", "again")).resolves.toBeDefined();
    });

    it("rejects a delete with a stale SHA and keeps the Note", async () => {
      const storage = await fresh();
      const { sha } = await storage.create("a.md", "one");
      await storage.write("a.md", "two", sha);
      await expect(storage.delete("a.md", sha)).rejects.toMatchObject({
        code: "stale-sha",
      });
      expect((await storage.read("a.md")).content).toBe("two");
    });
  });
}
