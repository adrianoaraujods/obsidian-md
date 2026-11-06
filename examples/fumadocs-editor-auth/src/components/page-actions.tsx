import { ExternalLink, Pencil } from "lucide-react";

import { githubBlobUrl, rawMarkdownPath } from "@/lib/page-actions";
import { actionClass } from "./action-class";
import { CopyMarkdown } from "./copy-markdown";

/**
 * Edit, View on GitHub and Copy Markdown, in one row under the page title.
 * The row is identical for everyone, signed in or not. Edit always shows;
 * signed-out visitors are sent to GitHub sign-in when they follow it. View on
 * GitHub shows only when the repo, branch and Vault subdirectory variables
 * are set.
 */
export function PageActions({
  slug,
  notePath,
}: {
  slug: string[];
  notePath: string;
}) {
  const githubUrl = githubBlobUrl(process.env, notePath);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <a
        className={`${actionClass} border-fd-primary bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90`}
        href={`/edit/${slug.join("/")}`}
      >
        <Pencil className="size-4" />
        Edit
      </a>
      {githubUrl && (
        <a
          className={actionClass}
          href={githubUrl}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="size-4" />
          View on GitHub
        </a>
      )}
      <CopyMarkdown href={rawMarkdownPath(notePath)} />
    </div>
  );
}
