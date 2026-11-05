/** The signed-in person a commit is attributed to. */
export type CommitEditor = { name?: string | null; login: string };

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The commit a Save is about to make, for the confirmation dialog. It mirrors
 * what the server writes (the GitHub storage's commit message), so the person
 * sees the real subject and trailer; the server alone decides the final text.
 */
export function commitPreview(
  path: string,
  editor: CommitEditor,
): { subject: string; trailer: string } {
  const login = oneLine(editor.login);
  const name = editor.name ? oneLine(editor.name) : "";
  return {
    subject: `Update ${path}`,
    trailer: [
      "Edited-with: obsidian-md editor",
      `Edited-by: ${name ? `${name} (@${login})` : `@${login}`}`,
    ].join("\n"),
  };
}
