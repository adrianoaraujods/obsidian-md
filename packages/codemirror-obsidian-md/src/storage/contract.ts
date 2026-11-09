import { afterEach, describe, expect, it } from "vitest";

import type { CommitStorage, Storage } from "./types.js";

export interface StorageContractOptions {
  /** Set to `false` for a storage that cannot commit a changeset (the browser client). */
  commit?: boolean;
}

export interface StorageContractSubject {
  /** A storage over an empty Vault. */
  storage: Storage | CommitStorage;
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
  { commit: withCommit = true }: StorageContractOptions = {},
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

    describe.runIf(withCommit)("commit", () => {
      async function seeded(): Promise<CommitStorage> {
        const storage = (await fresh()) as CommitStorage;
        if (typeof storage.commit !== "function") {
          throw new Error("This storage has no commit; pass { commit: false }");
        }
        await storage.create("a.md", "A");
        await storage.create("Notes/b.md", "B");
        return storage;
      }

      it("applies writes, deletes and renames as one commit", async () => {
        const storage = await seeded();
        const base = await storage.base();
        const result = await storage.commit(
          [
            { type: "write", path: "new/c.md", content: "C" },
            { type: "delete", path: "a.md" },
            { type: "rename", from: "Notes/b.md", to: "Moved/b.md" },
          ],
          base,
        );
        expect((await storage.read("new/c.md")).content).toBe("C");
        expect((await storage.read("Moved/b.md")).content).toBe("B");
        await expect(storage.read("a.md")).rejects.toThrow();
        await expect(storage.read("Notes/b.md")).rejects.toThrow();
        expect(result.base).toBe(await storage.base());
        expect(result.base).not.toBe(base);
      });

      it("keeps the SHA of a renamed file", async () => {
        const storage = await seeded();
        const before = await storage.read("a.md");
        await storage.commit(
          [{ type: "rename", from: "a.md", to: "z.md" }],
          await storage.base(),
        );
        expect((await storage.read("z.md")).sha).toBe(before.sha);
      });

      it("lets a rewritten file land in the same commit as its rename", async () => {
        const storage = await seeded();
        await storage.commit(
          [
            { type: "rename", from: "a.md", to: "b.md" },
            { type: "write", path: "b.md", content: "A, rewritten" },
            { type: "write", path: "Notes/b.md", content: "B, links fixed" },
          ],
          await storage.base(),
        );
        expect((await storage.read("b.md")).content).toBe("A, rewritten");
        expect((await storage.read("Notes/b.md")).content).toBe(
          "B, links fixed",
        );
        await expect(storage.read("a.md")).rejects.toThrow();
      });

      it("writes over an existing file without a SHA", async () => {
        const storage = await seeded();
        await storage.commit(
          [{ type: "write", path: "a.md", content: "A2" }],
          await storage.base(),
        );
        expect((await storage.read("a.md")).content).toBe("A2");
      });

      it("allows a rename into a path another change in the set frees", async () => {
        const storage = await seeded();
        await storage.commit(
          [
            { type: "rename", from: "a.md", to: "tmp.md" },
            { type: "rename", from: "Notes/b.md", to: "a.md" },
          ],
          await storage.base(),
        );
        expect((await storage.read("a.md")).content).toBe("B");
        expect((await storage.read("tmp.md")).content).toBe("A");
      });

      it("rejects a stale base and applies nothing", async () => {
        const storage = await seeded();
        const stale = await storage.base();
        await storage.commit(
          [{ type: "write", path: "other.md", content: "O" }],
          stale,
        );
        await expect(
          storage.commit(
            [
              { type: "write", path: "mine.md", content: "M" },
              { type: "delete", path: "a.md" },
            ],
            stale,
          ),
        ).rejects.toMatchObject({ name: "StaleBaseError", code: "stale-base" });
        await expect(storage.read("mine.md")).rejects.toThrow();
        expect((await storage.read("a.md")).content).toBe("A");
      });

      it("rejects a rename onto an existing path and applies nothing", async () => {
        const storage = await seeded();
        await expect(
          storage.commit(
            [
              { type: "write", path: "extra.md", content: "X" },
              { type: "rename", from: "a.md", to: "Notes/b.md" },
            ],
            await storage.base(),
          ),
        ).rejects.toMatchObject({
          name: "AlreadyExistsError",
          code: "already-exists",
          path: "Notes/b.md",
        });
        await expect(storage.read("extra.md")).rejects.toThrow();
        expect((await storage.read("a.md")).content).toBe("A");
        expect((await storage.read("Notes/b.md")).content).toBe("B");
      });

      it("rejects renaming or deleting a file that is not there", async () => {
        const storage = await seeded();
        const base = await storage.base();
        await expect(
          storage.commit(
            [{ type: "rename", from: "nope.md", to: "x.md" }],
            base,
          ),
        ).rejects.toMatchObject({ code: "stale-sha", path: "nope.md" });
        await expect(
          storage.commit([{ type: "delete", path: "nope.md" }], base),
        ).rejects.toMatchObject({ code: "stale-sha", path: "nope.md" });
        expect(await storage.base()).toBe(base);
      });
    });
  });
}
