import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import { planReorganization } from "../../src/manager/index.js";
import { createFilesystemStorage } from "../../src/storage/filesystem.js";

let root = "";
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "manager-"));
  await mkdir(join(root, "Folder"));
  await writeFile(join(root, "Alpha.md"), "alpha");
  await writeFile(join(root, "Beta.md"), "beta");
});
afterEach(() => rm(root, { recursive: true, force: true }));

it("a planned set commits through the filesystem adapter in one step", async () => {
  const storage = createFilesystemStorage({ root });
  const base = await storage.base();
  const plan = planReorganization({
    files: ["Alpha.md", "Beta.md"],
    changes: [
      { type: "move", from: "Alpha.md", to: "Folder/Alpha.md" },
      { type: "move", from: "Beta.md", to: "Gamma.md" },
    ],
  });
  if (!plan.ok) throw new Error(plan.error);

  await storage.commit(plan.changeset, base);

  expect((await readdir(root)).sort()).toEqual(["Folder", "Gamma.md"]);
  expect(await readdir(join(root, "Folder"))).toEqual(["Alpha.md"]);
});
