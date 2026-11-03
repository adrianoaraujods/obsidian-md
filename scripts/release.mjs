// Publishes every workspace package whose version is not on npm yet.
//
// `changeset publish` would hand the upload to `pnpm publish`, which fails the
// npm trusted-publishing (OIDC) exchange. So each package is packed with pnpm
// (which rewrites `workspace:` ranges) and its tarball is uploaded with
// `npm publish`, which supports OIDC and provenance. `changeset tag` then
// creates the git tags that changesets/action pushes and turns into releases.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", ...opts });

const isPublished = (name, version) => {
  try {
    execFileSync("npm", ["view", `${name}@${version}`, "version"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

run("pnpm", ["build"]);

const packagesDir = "packages";
for (const dir of readdirSync(packagesDir)) {
  const cwd = join(packagesDir, dir);
  const {
    name,
    version,
    private: isPrivate,
  } = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  if (isPrivate) continue;
  if (isPublished(name, version)) {
    console.log(`${name}@${version} is already published`);
    continue;
  }

  const out = mkdtempSync(join(tmpdir(), "release-"));
  run("pnpm", ["pack", "--pack-destination", out], { cwd });
  const [tarball] = readdirSync(out);
  run(
    "npm",
    ["publish", join(out, tarball), "--access", "public", "--provenance"],
    { cwd },
  );
}

run("pnpm", ["changeset", "tag"]);
