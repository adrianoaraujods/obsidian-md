import { vault } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";

import { slugifyPath, slugRenames } from "@/lib/vault-slugs";

const vaultSource = vault.toFumadocsSource();

/**
 * Fumadocs' "Duplicated slugs" error names the slug but not the Notes that
 * produce it. Fail first with both paths, so the fix is obvious.
 */
function assertNoDuplicateSlugs(
  files: { type: "page" | "meta"; path: string }[],
): void {
  const seen = new Map<string, string>();

  for (const file of files) {
    if (file.type !== "page") continue;

    const slug = slugifyPath(file.path);
    const duplicate = seen.get(slug);
    if (duplicate) {
      throw new Error(
        `Duplicate page slug "${slug}" from "${duplicate}" and "${file.path}". ` +
          "Rename one of the Notes, or give them names slugify maps to different slugs.",
      );
    }
    seen.set(slug, file.path);
  }
}

assertNoDuplicateSlugs(vaultSource.files);

if (slugRenames.length > 0) {
  console.warn(
    `[slugs] ${slugRenames.length} Note(s) published under a distinct slug:\n` +
      slugRenames
        .map((notePath) => `  ${notePath} → ${slugifyPath(notePath)}`)
        .join("\n"),
  );
}

export const source = loader({
  baseUrl: "/",
  source: vaultSource,
  slugs: (file) => slugifyPath(file.path).split("/").filter(Boolean),
});
