import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { Account } from "@/components/account";
import { source } from "@/lib/source";

/**
 * The editor route tree. Each page under it calls `requireEditor`; a layout
 * alone is not enough, because Next does not re-run layouts on client
 * navigation.
 */
export default function EditLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <DocsLayout sidebar={{ footer: <Account /> }} tree={source.getPageTree()}>
      {children}
    </DocsLayout>
  );
}
