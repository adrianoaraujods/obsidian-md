import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";

import { requireEditor } from "@/lib/auth/session";
import { source } from "@/lib/source";

/** Placeholder: the editor itself lands in a later ticket. */
export default async function EditPage(props: PageProps<"/edit/[[...slug]]">) {
  const { slug = [] } = await props.params;
  await requireEditor(slug);

  const page = source.getPage(slug);
  if (!page) notFound();

  return (
    <DocsPage>
      <DocsTitle>Editing {page.data.title}</DocsTitle>
      <DocsBody>
        <p data-testid="editor-placeholder">The editor is coming soon.</p>
        <p>
          <a href={page.url}>Back to the Note</a>
        </p>
      </DocsBody>
    </DocsPage>
  );
}
