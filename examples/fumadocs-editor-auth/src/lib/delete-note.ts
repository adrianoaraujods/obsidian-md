type NoteStorage = {
  read(path: string): Promise<{ sha: string }>;
  delete(path: string, sha: string): Promise<void>;
};

/** Deletes a Note with its current SHA, read first so a stale SHA is never sent. */
export async function deleteNote(storage: NoteStorage, path: string) {
  const { sha } = await storage.read(path);
  await storage.delete(path, sha);
}
