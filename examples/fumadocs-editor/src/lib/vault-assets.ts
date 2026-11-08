import { readdir } from "node:fs/promises";
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
