import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { Account } from "@/components/account";
import { FileTreeMenu } from "@/components/file-tree-menu/file-tree-menu";
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

  return (
    <DocsLayout
      sidebar={{
        footer: (
          <>
            <Account />
            <FileTreeMenu notes={notes} />
          </>
        ),
      }}
      tree={tree}
    >
      {children}
    </DocsLayout>
  );
}
