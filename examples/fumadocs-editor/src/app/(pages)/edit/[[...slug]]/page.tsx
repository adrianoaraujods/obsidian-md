import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";

import { NoteEditor } from "@/components/editor/note-editor";
import { isEditEnabled } from "@/lib/page-actions";
import { source } from "@/lib/source";

/** The raw-Markdown editor, loaded client-side on this route only. */
export default async function EditPage(props: PageProps<"/edit/[[...slug]]">) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page || !isEditEnabled()) notFound();

  const candidates = source
    .getPages()
    .map((p) => ({ path: p.path, title: p.data.title }));

  return (
    <DocsPage full>
      <DocsTitle>Editing {page.data.title}</DocsTitle>
      <DocsBody>
        <NoteEditor
          candidates={candidates}
          path={page.path}
          viewHref={page.url}
        />
        <p>
          <a href={page.url}>Back to the Note</a>
        </p>
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}
