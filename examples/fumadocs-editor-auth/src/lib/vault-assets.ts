import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Every Asset in the Vault directory (a file that is not a Note, Vault-relative
 * with `/` separators). Hidden entries (`.git`, `.obsidian`) and Fumadocs
 * `meta.json` files are not Assets.
 */
export async function listAssets(root: string, folder = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, folder), {
    withFileTypes: true,
  }).catch(() => []);
  const assets: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const rel = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) assets.push(...(await listAssets(root, rel)));
    else if (!/\.md$/i.test(entry.name) && entry.name !== "meta.json")
      assets.push(rel);
  }
  return assets;
}

/**
 * The text of every Fumadocs `meta.json` in the Vault directory, keyed by its
 * folder (Vault-relative, `""` for the root).
 */
export async function readMetas(
  root: string,
  folder = "",
): Promise<Record<string, string>> {
  const entries = await readdir(path.join(root, folder), {
    withFileTypes: true,
  }).catch(() => []);
  const metas: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const rel = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(metas, await readMetas(root, rel));
    else if (entry.name === "meta.json")
      metas[folder] = await readFile(path.join(root, rel), "utf8");
  }
  return metas;
}
