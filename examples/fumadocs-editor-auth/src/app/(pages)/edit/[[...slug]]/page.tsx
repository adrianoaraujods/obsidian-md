import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";

import { NoteEditor } from "@/components/editor/note-editor";
import { requireEditor } from "@/lib/auth/session";
import { source } from "@/lib/source";

/**
 * The editor for one Note. The page itself holds no Note text: the editor
 * loads the live file and its SHA from GitHub in the browser, so edits are
 * fresh before the next redeploy.
 */
export default async function EditPage(props: PageProps<"/edit/[[...slug]]">) {
  const { slug = [] } = await props.params;
  const session = await requireEditor(slug);

  const page = source.getPage(slug);
  if (!page) notFound();

  const { name, login } = session.user as { name?: string; login?: string };

  return (
    <DocsPage full>
      <DocsTitle>Editing {page.data.title}</DocsTitle>
      <DocsBody>
        <NoteEditor
          candidates={source
            .getPages()
            .map((note) => ({ path: note.path, title: note.data.title }))}
          editor={{ name: name ?? null, login: login ?? "" }}
          path={page.path}
          title={page.data.title}
        />
        <p>
          <a href={page.url}>Back to the Note</a>
        </p>
      </DocsBody>
    </DocsPage>
  );
}
