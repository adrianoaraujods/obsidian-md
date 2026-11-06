import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";

import { NoteEditor } from "@/components/editor/note-editor";
import { requireEditor } from "@/lib/auth/session";
import { lockTimings } from "@/lib/lock-timings";
import { createdCommit, createdNoteMatches, folderOf } from "@/lib/new-note";
import { source } from "@/lib/source";

/**
 * The editor for one Note. The page itself holds no Note text: the editor
 * loads the live file and its SHA from GitHub in the browser, so edits are
 * fresh before the next redeploy.
 */
export default async function EditPage(props: PageProps<"/edit/[[...slug]]">) {
  const { slug = [] } = await props.params;
  const { new: created, commit } = await props.searchParams;
  const session = await requireEditor(slug);

  const existing = source.getPages().map((note) => note.path);
  const page = source.getPage(slug);

  // A Note created since the last deploy is not in the build, so there is no
  // page for it. `?new=<Vault path>` (set by /edit/new/open) stands in for it,
  // checked against the slug so it cannot open an arbitrary file.
  //
  // The created Note opens locked until its create commit is deployed:
  // `?commit=` is that commit, passed to the editor as `lockedCommit`.
  const createdPath =
    !page &&
    typeof created === "string" &&
    createdNoteMatches(slug, created, existing)
      ? created
      : null;

  const path = page?.path ?? createdPath;
  if (!path) notFound();
  const title =
    page?.data.title ?? (path.split("/").pop() ?? path).replace(/\.mdx?$/i, "");

  const { name, login } = session.user as { name?: string; login?: string };
  const folder = folderOf(path);

  return (
    <DocsPage full>
      <DocsTitle>Editing {title}</DocsTitle>
      <DocsBody>
        <NoteEditor
          candidates={source
            .getPages()
            .map((note) => ({ path: note.path, title: note.data.title }))}
          editor={{ name: name ?? null, login: login ?? "" }}
          lockedCommit={createdPath ? createdCommit(commit) : undefined}
          lockTimings={lockTimings(process.env)}
          path={path}
          title={title}
          viewHref={`/${slug.join("/")}`}
        />
        <p>
          {page && <a href={page.url}>Back to the Note</a>}
          {page && " · "}
          <a
            href={`/edit/new${folder ? `?${new URLSearchParams({ folder })}` : ""}`}
          >
            New note
          </a>
        </p>
      </DocsBody>
    </DocsPage>
  );
}
