import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { source } from "@/lib/source";

export default function EditLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DocsLayout tree={source.getPageTree()}>{children}</DocsLayout>;
}
