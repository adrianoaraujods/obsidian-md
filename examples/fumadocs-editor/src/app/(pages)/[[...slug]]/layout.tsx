import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { source } from "@/lib/source";

export default function VaultLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tree = source.getPageTree();

  return <DocsLayout tree={tree}>{children}</DocsLayout>;
}
