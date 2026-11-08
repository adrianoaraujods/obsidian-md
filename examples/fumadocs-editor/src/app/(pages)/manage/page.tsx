import { readFile } from "node:fs/promises";
import path from "node:path";

import { createFilesystemStorage } from "codemirror-obsidian-md/storage/filesystem";
import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";

import { Manager } from "@/components/manager/manager";
import { isEditEnabled } from "@/lib/page-actions";
import { source } from "@/lib/source";
import { vaultDir } from "@/lib/vault-dir";

export const dynamic = "force-dynamic";

/**
 * Reorganize the Vault. The tree is the deployed Vault (the Notes the build
 * read); the base is the Vault on disk at this moment, which Apply checks so a
 * change made meanwhile is never overwritten.
 */
export default async function ManagePage() {
  if (!isEditEnabled()) notFound();

  const files = source.getPages().map((page) => page.path);
  // The Notes' text, so the Manager can work out which links a change breaks.
  const notes: Record<string, string> = {};
  for (const file of files) {
    if (!file.toLowerCase().endsWith(".md")) continue;
    notes[file] = await readFile(path.join(vaultDir, file), "utf8").catch(
      () => "",
    );
  }
  const base = await createFilesystemStorage({ root: vaultDir }).base();

  return (
    <DocsPage full>
      <DocsTitle>Manage the Vault</DocsTitle>
      <DocsBody>
        <Manager base={base} files={files} notes={notes} />
      </DocsBody>
    </DocsPage>
  );
}
