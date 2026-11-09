/** A Note's text together with the SHA that identifies this version of it. */
export interface StorageFile {
  content: string;
  sha: string;
}

/** Result of a successful `write` or `create`. */
export interface StorageWriteResult {
  /** SHA of the content just stored; pass it to the next `write` or `delete`. */
  sha: string;
  /**
   * Identifier of the commit that holds the change, for adapters backed by
   * version control. Pass it to `StorageLock.isDeployed`.
   */
  commit?: string;
}

/**
 * Optional capability for backends whose saves reach readers only after a
 * deploy. The editor locks a Note after a save only when this is present.
 */
export interface StorageLock {
  /** Whether the deployed build already includes `commit`. */
  isDeployed(commit: string): Promise<boolean>;
}

/**
 * Where an editor reads and saves Notes. Paths are relative to the Vault
 * root. Adapters throw `StaleShaError` and `AlreadyExistsError` for the two
 * expected failures; anything else is an unexpected error.
 */
export interface Storage {
  /** Load a Note's current text and SHA. */
  read(path: string): Promise<StorageFile>;
  /** Replace a Note. Throws `StaleShaError` if `sha` is no longer current. */
  write(
    path: string,
    content: string,
    sha: string,
  ): Promise<StorageWriteResult>;
  /** Add a new Note (a write with no SHA). Throws `AlreadyExistsError` if the path is taken. */
  create(path: string, content: string): Promise<StorageWriteResult>;
  /** Remove a Note. Throws `StaleShaError` if `sha` is no longer current. */
  delete(path: string, sha: string): Promise<void>;
  /** Present only on adapters that need the editor to wait for a deploy. */
  lock?: StorageLock;
}

/** One change in a changeset, applied in order against the Vault as it stands after the previous one. */
export type Change =
  /** Write a whole file, creating it or replacing it. */
  | { type: "write"; path: string; content: string }
  | { type: "delete"; path: string }
  /** Move a file to a path that is free at that point in the set. */
  | { type: "rename"; from: string; to: string };

/** A list of changes applied as one atomic commit. */
export type Changeset = Change[];

/** Result of a successful `commit`. */
export interface StorageCommitResult {
  /** The Vault's new base; pass it to the next `commit`. */
  base: string;
  /** Identifier of the commit, for adapters backed by version control. */
  commit?: string;
}

/**
 * Storage that can apply a Changeset atomically (the GitHub and filesystem
 * adapters). `base` identifies the whole Vault at a moment: a commit SHA on
 * GitHub, a tree hash on disk.
 */
export interface CommitStorage extends Storage {
  /** The Vault's current base. */
  base(): Promise<string>;
  /**
   * The Vault paths changed (added, changed, removed or renamed, both ends)
   * between `base` and the current base. Lets a host decide whether a
   * `StaleBaseError` can be retried on the new base. Absent when the adapter
   * cannot tell.
   */
  changedSince?(base: string): Promise<string[]>;
  /**
   * Apply every change or none. Throws `StaleBaseError` if the Vault moved on
   * since `base`, `AlreadyExistsError` if a rename lands on a taken path, and
   * `StaleShaError` if a rename or delete names a file that is not there.
   * Never forces the ref.
   */
  commit(
    changeset: Changeset,
    base: string,
    message?: CommitMessage,
  ): Promise<StorageCommitResult>;
}

/**
 * The words of a commit, for adapters backed by version control. Each is
 * collapsed to one line; the adapter adds its own trailer after them, so
 * nothing here can forge it. Without it the adapter words the commit itself.
 */
export interface CommitMessage {
  subject: string;
  /** One bullet per entry, without the leading `- `. */
  body?: string[];
}
