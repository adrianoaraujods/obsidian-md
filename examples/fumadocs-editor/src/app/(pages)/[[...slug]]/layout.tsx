import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { FileTreeMenu } from "@/components/file-tree-menu/file-tree-menu";
import { folderRefs } from "@/lib/file-tree-targets";
import { isEditEnabled } from "@/lib/page-actions";
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
        footer: isEditEnabled() ? (
          <FileTreeMenu folders={folders} notes={notes} />
        ) : undefined,
      }}
      tree={tree}
    >
      {children}
    </DocsLayout>
  );
}
