import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";

import { NewNoteForm } from "@/components/editor/new-note-form";
import { requireEditor } from "@/lib/auth/session";
import { source } from "@/lib/source";

// Reads the session on every request; never prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * Create a Note: pick a folder and a name, then Create commits it. Reached
 * from the editor and from "New note here" in the file tree menu (`?folder=`
 * presets the folder).
 */
export default async function NewNotePage(props: PageProps<"/edit/new">) {
  await requireEditor(["new"]);
  const { folder } = await props.searchParams;

  return (
    <DocsPage full>
      <DocsTitle>New note</DocsTitle>
      <DocsBody>
        <NewNoteForm
          existingPaths={source.getPages().map((page) => page.path)}
          folder={typeof folder === "string" ? folder : ""}
        />
      </DocsBody>
    </DocsPage>
  );
}
