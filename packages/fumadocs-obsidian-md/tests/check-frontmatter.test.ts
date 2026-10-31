import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findUnparseableFrontmatter,
  runCheck,
} from "../src/check-frontmatter.js";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/frontmatter",
);
const valid = path.join(fixtures, "valid");
const corrupt = path.join(fixtures, "corrupt");

function run(dir: string) {
  let out = "";
  let err = "";
  const code = runCheck([dir], {
    stdout: (text) => {
      out += text;
    },
    stderr: (text) => {
      err += text;
    },
  });
  return { code, out, err };
}

describe("findUnparseableFrontmatter", () => {
  it("finds nothing in a Vault with valid Frontmatter", () => {
    expect(findUnparseableFrontmatter(valid)).toEqual([]);
  });

  it("names every Note whose Frontmatter cannot be parsed", () => {
    const paths = findUnparseableFrontmatter(corrupt).map((f) => f.path);
    expect(paths).toEqual(["Broken One.md", "sub/Broken Two.mdx"]);
  });
});

describe("runCheck", () => {
  it("exits zero on a Vault with valid Frontmatter", () => {
    const { code, err } = run(valid);
    expect(code).toBe(0);
    expect(err).toBe("");
  });

  it("names each corrupt Note and exits non-zero", () => {
    const { code, err } = run(corrupt);
    expect(code).not.toBe(0);
    expect(err).toContain("Broken One.md");
    expect(err).toContain("sub/Broken Two.mdx");
    expect(err).not.toContain("Fine.md");
  });

  it("exits non-zero when the Vault directory does not exist", () => {
    const { code, err } = run(path.join(fixtures, "missing"));
    expect(code).not.toBe(0);
    expect(err).toContain("missing");
  });
});
