import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

export interface UnparseableFrontmatter {
  /** Vault-relative path, with `/` separators. */
  path: string;
  /** The YAML parser's message. */
  message: string;
}

// Same pattern Fumadocs uses to cut the Frontmatter block off a Note.
const FRONTMATTER = /^---\r?\n(.+?)\r?\n---\r?\n?/s;

/**
 * Scans a Vault for Notes (`.md` and `.mdx`) whose Frontmatter YAML cannot be
 * parsed. Dot-folders such as `.obsidian` are skipped. Result is sorted by
 * path.
 */
export function findUnparseableFrontmatter(
  dir: string,
): UnparseableFrontmatter[] {
  const found: UnparseableFrontmatter[] = [];

  function walk(relative: string) {
    const entries = readdirSync(path.join(dir, relative), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else if (/\.mdx?$/i.test(entry.name)) check(child);
    }
  }

  function check(notePath: string) {
    const match = FRONTMATTER.exec(
      readFileSync(path.join(dir, notePath), "utf8"),
    );
    if (!match) return;
    try {
      parse(match[1] ?? "");
    } catch (error) {
      found.push({
        path: notePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  walk("");
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export interface CheckIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/**
 * The command behind `fumadocs-obsidian-md-check`. `args[0]` is the Vault
 * directory. Returns the process exit code: 0 when every Note parses, 1 when
 * any does not or the directory cannot be read.
 */
export function runCheck(args: readonly string[], io: CheckIo): number {
  const dir = path.resolve(args[0] ?? process.env.VAULT_DIR ?? "public/vault");

  try {
    if (!statSync(dir).isDirectory()) throw new Error("not a directory");
  } catch {
    io.stderr(`Vault directory not found: ${dir}\n`);
    return 1;
  }

  const problems = findUnparseableFrontmatter(dir);
  if (problems.length === 0) {
    io.stdout(`Frontmatter OK: every Note in ${dir} parses.\n`);
    return 0;
  }

  const lines = problems.map(
    ({ path: notePath, message }) =>
      `  ${notePath}\n    ${message.split("\n")[0]}`,
  );
  io.stderr(
    `${problems.length} Note(s) have Frontmatter YAML that cannot be parsed:\n` +
      `${lines.join("\n")}\n\n` +
      "Fix the YAML, or apply the Fumadocs patch so a bad Note renders as plain\n" +
      "Markdown (see the fumadocs-obsidian-md README).\n",
  );
  return 1;
}
