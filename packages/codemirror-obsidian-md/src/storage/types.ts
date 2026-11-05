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
