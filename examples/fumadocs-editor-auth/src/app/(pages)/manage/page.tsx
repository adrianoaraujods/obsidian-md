import { readFile } from "node:fs/promises";
import path from "node:path";

import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";

import { Manager } from "@/components/manager/manager";
import { requireManager } from "@/lib/auth/session";
import { resolveDeployedCommit } from "@/lib/build";
import { getEnv } from "@/lib/env";
import { source } from "@/lib/source";
import { createCommitStorage } from "@/lib/storage";
import { listAssets, readMetas } from "@/lib/vault-assets";
import { vaultDir } from "@/lib/vault-dir";

// Reads the session on every request; never prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * Reorganize the Vault. The tree is the deployed Vault (the Notes the build
 * read). The base is the repo's HEAD at this moment (the Vault's tree hash in
 * development); Apply checks it, so a commit that landed meanwhile is never
 * overwritten.
 */
export default async function ManagePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { focus } = await props.searchParams;
  const session = await requireManager(
    typeof focus === "string" ? focus : undefined,
  );
  const { name, login } = session.user as { name?: string; login?: string };
  const editor = { name: name ?? null, login: login ?? "" };

  // Notes and Assets: a folder moves with everything in it.
  const noteFiles = source.getPages().map((page) => page.path);
  const files = [...noteFiles, ...(await listAssets(vaultDir))].sort();
  // The Notes' text, so the Manager can work out which links a change breaks.
  const notes: Record<string, string> = {};
  for (const file of noteFiles) {
    if (!file.toLowerCase().endsWith(".md")) continue;
    notes[file] = await readFile(path.join(vaultDir, file), "utf8").catch(
      () => "",
    );
  }
  const base = await createCommitStorage(
    {
      env: getEnv,
      deployedCommit: () => resolveDeployedCommit(),
      getEditor: async () => editor,
    },
    editor,
  ).base();

  return (
    <DocsPage full>
      <DocsTitle>Manage the Vault</DocsTitle>
      <DocsBody>
        <Manager
          base={base}
          editor={editor}
          files={files}
          focus={typeof focus === "string" ? focus : undefined}
          metas={await readMetas(vaultDir)}
          notes={notes}
        />
      </DocsBody>
    </DocsPage>
  );
}
