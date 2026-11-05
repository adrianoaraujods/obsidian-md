# codemirror-obsidian-md

A CodeMirror 6 editor for Obsidian Notes (in progress, see the project spec).

## Storage

The editor saves through a `Storage` object you pass in (`read`, `write`, `create`, `delete`, and an optional `lock` capability).

```ts
import type { Storage } from "codemirror-obsidian-md/storage";
import { createFilesystemStorage } from "codemirror-obsidian-md/storage/filesystem";

const storage = createFilesystemStorage({ root: "./content" });
```

Stale writes throw `StaleShaError`; creating an existing path throws `AlreadyExistsError`.

To test your own adapter, run the shared suite from a Vitest file:

```ts
import { runStorageContract } from "codemirror-obsidian-md/storage/contract";

runStorageContract("my adapter", async () => ({ storage: makeStorage() }));
```
