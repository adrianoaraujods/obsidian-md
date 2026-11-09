import { checkSegments } from "../paths.js";

export type NewNoteResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export interface NewNoteInput {
  /** Typed or picked folder, Vault-relative. Empty means the Vault root. */
  folder: string;
  /** The Note's name; `.md` is appended when missing. */
  name: string;
  /** Vault-relative paths of every existing Note. */
  existing: readonly string[];
}

/** Every folder that holds a Note, parents included, sorted. */
export function listFolders(paths: readonly string[]): string[] {
  const folders = new Set<string>();
  for (const path of paths) {
    const parts = path.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      folders.add(parts.slice(0, i).join("/"));
    }
  }
  return [...folders].sort();
}

/**
 * Validate a new Note and produce its Vault-relative path. A folder exists
 * only once a Note is created in it, so nothing but the Note is produced.
 */
export function resolveNewNote(input: NewNoteInput): NewNoteResult {
  const name = input.name.trim();
  const folder = input.folder.trim().replace(/\/+$/, "");
  if (name === "" || name.toLowerCase() === ".md")
    return { ok: false, error: "Enter a name for the Note." };

  const nameError = checkSegments(name, "name");
  if (nameError) return { ok: false, error: nameError };
  if (folder !== "") {
    const folderError = checkSegments(folder, "folder");
    if (folderError) return { ok: false, error: folderError };
  }

  const file = name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
  const path = folder === "" ? file : `${folder}/${file}`;

  if (input.existing.includes(path))
    return { ok: false, error: `"${path}" already exists.` };
  const lower = path.toLowerCase();
  const clash = input.existing.find((p) => p.toLowerCase() === lower);
  if (clash)
    return {
      ok: false,
      error: `"${path}" differs only in case from the existing "${clash}".`,
    };
  return { ok: true, path };
}
