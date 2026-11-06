import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { AlreadyExistsError, StaleShaError } from "./errors.js";
import type { Storage, StorageFile } from "./types.js";

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
 * commit would be. It has no lock capability: saves are instant.
 */
export function createFilesystemStorage({
  root,
}: FilesystemStorageOptions): Storage {
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

  return {
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
