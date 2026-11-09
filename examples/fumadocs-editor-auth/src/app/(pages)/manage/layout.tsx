import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { Account } from "@/components/account";
import { source } from "@/lib/source";

/**
 * The Manager route tree. Its page calls `requireManager`; a layout alone is
 * not enough, because Next does not re-run layouts on client navigation.
 */
export default function ManageLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <DocsLayout sidebar={{ footer: <Account /> }} tree={source.getPageTree()}>
      {children}
    </DocsLayout>
  );
}
