import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { Account } from "@/components/account";
import { FileTreeMenu } from "@/components/file-tree-menu/file-tree-menu";
import { folderRefs } from "@/lib/file-tree-targets";
import { source } from "@/lib/source";

export default function VaultLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tree = source.getPageTree();
  const notes = Object.fromEntries(
    source.getPages().map((page) => [page.url, page.path]),
  );

  const folders = folderRefs(tree.children, notes);

  return (
    <DocsLayout
      sidebar={{
        footer: (
          <>
            <Account />
            <FileTreeMenu folders={folders} notes={notes} />
          </>
        ),
      }}
      tree={tree}
    >
      {children}
    </DocsLayout>
  );
}
