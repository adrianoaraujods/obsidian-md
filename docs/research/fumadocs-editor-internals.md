# Fumadocs Editor internals: sync, SyncStorage, auth, hosting

Resolves #61 (child of map #60). Researched 2026-11-04.

## Version stamp (the project is experimental and moves fast)

- Repo `fuma-nama/fumadocs-editor`, MIT, branch `dev`, read at commit `a1de121` ("Version Packages (#39)", 2026-11-01). First commit 2026-09-05; about 50 commits.
- Packages read (npm `latest`, published 2026-11-01): `@fumadocs-editor/core@0.5.0`, `@fumadocs-editor/ui@0.7.0`, `@fumadocs-editor/studio@0.3.0`. `core` and `ui` were first published 2026-09-06.
- The studio README says: "Experimental. ... breaking changes expected for future v1 release". The server APIs we care about (`setup`, `onChange`, `connections()`, pluggable `storage`, `watch`) landed in PR #48 on 2026-11-01, three days before this research. Protocol version is `1` (`hello.protocol`).
- Sources: docs pages on editor.fumadocs.dev (`/sync`, `/server`, `/auth`, `/protocol`, `/collab`, `/studio`; fetched through a summarizer, so exact signatures below come from the repo source, not the rendered pages), and repo files `packages/core/src/sync/**`, `packages/ui/src/store.ts`, `apps/docs/content/*.mdx`, `apps/docs/examples/sync-storage*.ts`. Issues #24, #32, #41-#44 and PRs #33, #48 were read for intent.

## Short answer

1. Two ways to persist: (a) standalone, `MdxEditor` `defaultValue` + `onChange(markdown)` and you save yourself; (b) the sync stack (client, transport, server), which gives autosave, conflict detection, file-tree commands, uploads and auth.
2. `SyncStorage` is a plain async key-value interface (list/read/write/delete, optional watch). It has no versions and no conditional write. Versioning (sha1 of text), per-path locks and compare-and-swap live in the server's memory, in-process.
3. The sync server is a long-lived Node process with a WebSocket (`ws`) endpoint plus two HTTP handlers. As shipped it cannot run in a Next.js route handler or a serverless function. The Vite plugin is `apply: "serve"` (dev only).
4. A GitHub-backed storage is feasible for (b), with caveats: every autosave becomes a `write`, so commit-per-autosave unless the adapter batches, and the server needs a long-lived host. Option (a) works anywhere but gives up conflict handling, tree ops and assets.

## 1. `onChange` vs sync

`packages/ui/src/store.ts`:

```ts
interface DocumentOptions {
  defaultValue: string;
  sync?: MdxEditorSync;
  cacheKey?: string;
  onChange?: (markdown: string) => void;
}
```

- `onChange` fires with serialized markdown after a debounced serialize on editor `update` (plus blur/destroy flush), and when the MDX source tab is edited. Without `sync`, text starts from `defaultValue`. Nothing is persisted by the library; no conflict detection, no file tree.
- With `sync={{ path, client?, onStatus?, onOpen?, onWritable? }}` the text is read from the server (`defaultValue` is ignored) and the document autosaves.

Autosave (docs `/sync`; `TRAILING_MS = 800`, `MAX_WAIT_MS = 5000` in `client.ts`): 800 ms after typing stops, at most 5 s after the first unsaved change; Cmd-S, blur and unload save immediately. Status values: `synced | dirty | saving | conflict | offline | denied`. A save merges disk changes in first; if the same block changed on both sides, saving pauses until the user chooses `keepMine()` or `takeDisk()`.

## 2. Layers: transport, client, server

From `/protocol` and `packages/core/src/sync/{transport,client,protocol}.ts`:

- Transport: `SyncTransport { connect(listener): TransportConnection }`, `TransportConnection { send(msg); close() }`. Built-in `wsTransport(url?)`, defaulting to the dev-server mount (`SYNC_ENDPOINT`, `/__fde_sync` per issue #32) on the current host. Custom client transports are supported (docs show a worker/`postMessage` one).
- Client: `createSyncClient({ transport?, auth?: () => unknown, collab?: boolean | { user? } })` returns `SyncClient { status, onStatus, tree, onTree, run(TreeCommand), open(path, { editor, components?, syntax? }) -> SyncDocument, close }`. `auth()` is called on every connect, so tokens refresh on reconnect. One document per path per client.
- Server: `createSyncServer(options)` from `@fumadocs-editor/core/node`, speaking the protocol over WebSocket.

Protocol messages: `hello`, `subscribe`, `unsubscribe`, `update`, `error`. Resources: `file` (text + opaque `version`), `tree`, `doc` (collab Yjs). File save: client sends `update` on resource `file` with `{ path, text, base }`; the server writes only if `base` equals the current version, otherwise it replies with the current text and version and the client merges. No resume: after a reconnect the client re-hellos and re-subscribes. Framing: one message per frame (JSON text, or binary with a u32 header length + JSON header + bytes); an empty frame is a 20 s heartbeat, and the server drops a connection silent for 90 s.

Media: `POST UPLOAD_ENDPOINT` (body = file, `x-filename`, returns `{ src }`, stored under `assets/`, default limit 10 MiB and `image/*`, configurable via `upload`) and `GET ASSET_ENDPOINT/<path>`; both read the auth payload from the `AUTH_HEADER` header (JSON).

## 3. `SyncStorage` exact interface

`packages/core/src/sync/node/storage.ts` (core@0.5.0):

```ts
export interface SyncStorage {
  name?: string;
  list(dir: string): Promise<string[]>;            // every file under dir ("" = all), any depth
  read(path: string): Promise<Uint8Array | AsyncIterable<Uint8Array> | undefined>; // undefined = missing
  write(path: string, data: Uint8Array): Promise<void>;  // create or replace, with folders
  delete(path: string): Promise<void>;                   // no-op if absent
  watch?(changed: (path: string) => void): () => void | Promise<void>;
}
```

- The server normalizes paths before storage sees them: relative, `/`-separated, no leading `/`, no `..`, no backslash or NUL, and any segment starting with `.` or equal to `node_modules` is refused everywhere (`HIDDEN` regex). Dotfiles and `.git` paths can never be notes; hidden entries from `list` are dropped.
- `fsStorage(dir)` is the default (chokidar watcher with `awaitWriteFinish`). `root: dir` is sugar for `storage: fsStorage(dir)`. Docs ship examples for a KV store, a bucket with streamed reads, and a write-through backup wrapper (`{ ...fsStorage(dir), async write(...) }`).
- Versioning and conflicts are NOT in storage. In `files.ts`: `version = sha1(text)`; each path has an in-process promise lock; `update` does read, compare `current.version !== base`, then write, all under the lock. That is compare-and-swap in memory only; `storage.write` has no precondition, so two server instances on one backend can overwrite each other. Docs: "A plain key-value store is enough. Versions, locks and the tree stay in the server."
- `watch` (optional) is called with the path of any file or folder changed outside the server (IDE save, `git pull`). The server re-reads open files, ignores echoes of its own writes (an `own` version map), pushes to subscribers and merges into open collab docs. Without `watch` the server sees only its own writes, though saves read-before-write so a stale base is still detected.
- The tree build reads the first ~4 KB of each page for frontmatter titles and reads `meta.json` for ordering: `list` plus many small reads, expensive on a remote backend.
- Tree commands (`create`, `mkdir`, `delete`, `order`) are built by the server on `write`/`delete`: `create` writes a page with a `title` frontmatter and appends to the parent `meta.json` `pages`; `mkdir` writes `dir/meta.json` + `dir/index.mdx`; `order` rewrites `meta.json`. I found no rename/move command (workspace interface in `workspace.ts` lists create, mkdir, remove, order). Relevant to the map's rename gap; unconfirmed beyond reading that file.

## 4. `authenticate`

`packages/core/src/sync/node/scope.ts`:

```ts
export interface SyncScope {
  user?: SyncUser;                                  // presence identity
  read?: boolean | ((path: string) => boolean);     // default true
  write: boolean | ((path: string) => boolean);
}
export type SyncAuthenticate = (ctx: {
  request: IncomingMessage;   // upgrade or HTTP media request: cookies, headers
  payload?: unknown;          // client's auth() result; AUTH_HEADER on HTTP
}) => SyncScope | null | Promise<SyncScope | null>;
```

- Runs on every hello (so every reconnect) and every upload/asset request. `null` or a thrown error rejects; the client shows `denied` and stops reconnecting. Absent `authenticate` means allow-all with write.
- `read`/`write` predicates are synchronous, run per message on a normalized path; do async work inside `authenticate` and close over it. `write` gates saves, collab edits and all tree commands together. Issue #24 asked for a separate tree-command permission; it is closed but the type is unchanged in 0.5.0, so tree ops cannot be separated from page writes.
- Scope is fixed per connection. To revoke early use `setup(sync)` -> `sync.connections()` -> `conn.close()`; the client reconnects and `authenticate` re-decides (issue #44 / PR #48).
- `sync.onChange(listener)` yields `{ path, connection }` after each write/delete caused by a connection (saves, tree commands, collab writes), with `connection.user`, `.request`, `.payload`. It does not report outside changes. This is the natural hook for committing and for commit attribution.
- Host/Origin are not checked by the library. Issue #32 / PR #33 proposed it; the maintainer declined and said to check Origin/Host/token inside `authenticate`. A cookie-authenticated server must check `request.headers.origin` itself (cross-site WebSocket hijacking), and session cookies only reach the socket if the page and sync server share a cookie scope.
- Better Auth fit (inference, not documented upstream): `authenticate` receives a Node `IncomingMessage`; turn its headers into a `Headers`, look up the session, return `{ user: { name }, write: isEditor }`. Alternative: `createSyncClient({ auth: () => token })` and verify the token server-side.

## 5. Hosting the server

From source:

- `ws` `WebSocketServer({ noServer: true })`; `handleUpgrade(request, socket, head)` is mounted on a Node `http.Server` `upgrade` event; `handleUpload` and `handleAsset` are Node `(IncomingMessage, ServerResponse)` handlers (`apps/docs/examples/sync-server.ts` is a plain `node:http` server on port 3100).
- All state is in memory: per-path locks, own-write map, subscriber sets, collab Y.Docs (evicted 60 s after the last client leaves), tree index.
- Three run modes per docs `/server`: Vite plugin `editorSync` (`apply: "serve"`, dev only), Studio CLI (`npx @fumadocs-editor/studio`, Node 24+, forwards `server` options including `authenticate`, `storage`, `setup`), or bare Node HTTP via `createSyncServer`.
- Docs say nothing about Next.js, serverless or edge (searching `apps/docs/content` for next/serverless/edge/cloudflare finds no hosting guidance). The carrier (`createWsCarrier`) is not exported, so there is no supported way to serve the protocol over HTTP; docs: "To replace the Node server entirely, implement the sync protocol."

Inferences:

- Next.js route handlers and Vercel/Netlify functions cannot accept the WebSocket upgrade or hold the in-memory state. Options: a separate long-lived Node service (Fly, Railway, VPS, container) beside the Next app, or a Next custom server with an `upgrade` handler (loses Vercel hosting). Run exactly one instance, since locks and CAS are per process.
- Collab (Yjs) is out of scope per the map and has restart data-loss caveats (docs `/collab#restarts`); use plain file sync.
- A hand-written stateless backend implementing only the `file` resource over a custom `SyncTransport` is conceivable, but the client expects server pushes and reconnect semantics; unproven and costly.

## 6. GitHub-backed storage: feasibility and seams

Feasible on the sync-server route: a `SyncStorage` over the GitHub REST/Git Data API, used as `createSyncServer({ storage, authenticate, setup })`.

| Seam | Mapping | Concern |
| --- | --- | --- |
| `list(dir)` | `git/trees/{ref}?recursive=1`, filter by prefix | One call, cache by tree sha; truncation on huge repos |
| `read(path)` | blob/contents API to bytes | Tree builds read many page heads; needs a cache or it burns rate limit |
| `write(path, data)` | contents PUT or Git Data commit | Called per autosave (800 ms to 5 s): commit spam unless the adapter buffers and commits on idle/session end; reads must then see the buffer |
| `delete(path)` | contents DELETE / tree entry removal | Tree commands call write/delete several times (create touches page and `meta.json`); want one commit per command |
| `watch(changed)` | push webhook, call `changed(path)` per changed file | Needs a public webhook route reaching the sync host; otherwise only the server's own writes are seen |
| CAS | server's in-process sha1 lock; GitHub blob `sha` can detect a 409 | Interface cannot return a conflict, only throw (becomes an `error` reply); multi-instance unsafe |
| Attribution | `onChange` gives `connection.user` | Storage `write` does not know the user; stage the author via `onChange` or a per-connection side channel |

Other constraints: dot-paths unreachable; no rename; assets only under `assets/` with the upload limits above; the GitHub App/PAT stays server-side (compatible with Better Auth).

Fallback: use `MdxEditor` standalone with `onChange` and your own server action committing to GitHub. Simplest hosting (serverless fine), but conflicts, tree ops and uploads must be rebuilt. Both routes still depend on the editor round-tripping our Obsidian syntax, which is outside this ticket.

## Open questions / unverified

- Whether Studio can be deployed as a production process (documented as a local CLI); not tested.
- Rename/move support: not found, unconfirmed.
- The `SERIALIZE_MS` value behind `onChange` was not read.
- No code was run; everything is from reading source and docs as of 2026-11-04.
