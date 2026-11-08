import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { AlreadyExistsError, StaleBaseError, StaleShaError } from "./errors.js";
import type { CommitStorage, StorageFile } from "./types.js";

export interface FilesystemStorageOptions {
  /** Directory that Note paths are relative to. */
  root: string;
}

function hash(content: string): string {
  return createHash("sha1").update(content, "utf8").digest("hex");
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

/**
 * Local-first storage for development. The SHA is a hash of the file's
 * content, so a change made outside the adapter is detected like a newer
 * commit would be. It has no lock capability: saves are instant. The base of
 * `commit` is a hash of every file's path and content.
 */
export function createFilesystemStorage({
  root,
}: FilesystemStorageOptions): CommitStorage {
  const base = resolve(root);

  function locate(path: string): string {
    const full = resolve(base, path);
    const rel = relative(base, full);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`"${path}" is outside the storage root`);
    }
    return full;
  }

  async function load(full: string): Promise<string | null> {
    try {
      return await readFile(full, "utf8");
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async function assertCurrent(path: string, full: string, sha: string) {
    const current = await load(full);
    if (current === null || hash(current) !== sha) {
      throw new StaleShaError(path);
    }
  }

  /** Every file under the root, by relative path with `/` separators. */
  async function snapshot(): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    async function walk(dir: string): Promise<void> {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }
      for (const entry of entries) {
        if (entry.name === ".git") continue;
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) {
          files.set(
            relative(base, full).split(sep).join("/"),
            await readFile(full, "utf8"),
          );
        }
      }
    }
    await walk(base);
    return files;
  }

  function treeHash(files: Map<string, string>): string {
    const tree = createHash("sha1");
    for (const path of [...files.keys()].sort()) {
      tree.update(`${path}\0${hash(files.get(path) ?? "")}\n`, "utf8");
    }
    return tree.digest("hex");
  }

  return {
    async base() {
      return treeHash(await snapshot());
    },

    async commit(changeset, expected) {
      const before = await snapshot();
      if (treeHash(before) !== expected) throw new StaleBaseError(expected);

      // Plan the whole set in memory first; nothing touches the disk until
      // every change is known to apply.
      const after = new Map(before);
      for (const change of changeset) {
        if (change.type === "write") {
          locate(change.path);
          after.set(change.path, change.content);
        } else if (change.type === "delete") {
          locate(change.path);
          if (!after.delete(change.path)) throw new StaleShaError(change.path);
        } else {
          locate(change.to);
          const content = after.get(change.from);
          if (content === undefined) throw new StaleShaError(change.from);
          if (after.has(change.to)) throw new AlreadyExistsError(change.to);
          after.delete(change.from);
          after.set(change.to, content);
        }
      }

      const touched = [...new Set([...before.keys(), ...after.keys()])].filter(
        (path) => before.get(path) !== after.get(path),
      );
      try {
        for (const path of touched) {
          const content = after.get(path);
          const full = locate(path);
          if (content === undefined) await rm(full, { force: true });
          else {
            await mkdir(dirname(full), { recursive: true });
            await writeFile(full, content, "utf8");
          }
        }
      } catch (error) {
        // Put back what was there: the commit is all or nothing.
        for (const path of touched) {
          const original = before.get(path);
          const full = locate(path);
          if (original === undefined) await rm(full, { force: true });
          else await writeFile(full, original, "utf8");
        }
        throw error;
      }
      return { base: treeHash(after) };
    },

    async read(path): Promise<StorageFile> {
      const content = await readFile(locate(path), "utf8");
      return { content, sha: hash(content) };
    },

    async write(path, content, sha) {
      const full = locate(path);
      await assertCurrent(path, full, sha);
      await writeFile(full, content, "utf8");
      return { sha: hash(content) };
    },

    async create(path, content) {
      const full = locate(path);
      await mkdir(dirname(full), { recursive: true });
      try {
        await writeFile(full, content, { encoding: "utf8", flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new AlreadyExistsError(path);
        }
        throw error;
      }
      return { sha: hash(content) };
    },

    async delete(path, sha) {
      const full = locate(path);
      await assertCurrent(path, full, sha);
      await rm(full);
    },
  };
}
