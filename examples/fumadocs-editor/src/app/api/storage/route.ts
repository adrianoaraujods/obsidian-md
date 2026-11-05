import { createFilesystemStorage } from "codemirror-obsidian-md/storage/filesystem";
import { createStorageHandler } from "codemirror-obsidian-md/storage/http";

import { isEditEnabled } from "@/lib/page-actions";
import { vaultDir } from "@/lib/vault-dir";

/**
 * Load and save Notes on the Vault on disk. Development only, like the edit
 * route: a deployed build has no writable Vault, and there is no auth here.
 */
const handler = createStorageHandler(async () => {
  if (!isEditEnabled()) throw new Response(null, { status: 404 });
  return createFilesystemStorage({ root: vaultDir });
});

export { handler as DELETE, handler as GET, handler as POST, handler as PUT };
