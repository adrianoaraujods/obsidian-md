import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { Account } from "@/components/account";
import { source } from "@/lib/source";

export default function VaultLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tree = source.getPageTree();

  return (
    <DocsLayout sidebar={{ footer: <Account /> }} tree={tree}>
      {children}
    </DocsLayout>
  );
}
