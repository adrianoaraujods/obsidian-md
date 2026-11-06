import { notFound, redirect } from "next/navigation";

import { requireEditor } from "@/lib/auth/session";
import { createdCommit, createdNoteHref } from "@/lib/new-note";
import { source } from "@/lib/source";

export const dynamic = "force-dynamic";

/**
 * Where the new-Note form lands after Create: works out the slug the Note will
 * have once deployed and sends the editor to it.
 */
export default async function OpenCreatedNote(
  props: PageProps<"/edit/new/open">,
) {
  await requireEditor(["new"]);
  const { path, commit } = await props.searchParams;
  if (typeof path !== "string" || !path) notFound();

  redirect(
    createdNoteHref(
      path,
      source.getPages().map((page) => page.path),
      createdCommit(commit),
    ),
  );
}
