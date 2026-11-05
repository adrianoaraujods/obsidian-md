import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBuildSha } from "./build";

const SHA = "a".repeat(40);
const HEAD = "b".repeat(40);

describe("resolveBuildSha", () => {
  it("prefers the host variable over local git HEAD", () => {
    expect(resolveBuildSha({ VERCEL_GIT_COMMIT_SHA: SHA }, () => HEAD)).toBe(
      SHA,
    );
  });

  it("falls back to local git HEAD", () => {
    expect(resolveBuildSha({}, () => HEAD)).toBe(HEAD);
  });

  it("ignores a blank host variable", () => {
    expect(resolveBuildSha({ VERCEL_GIT_COMMIT_SHA: "  " }, () => HEAD)).toBe(
      HEAD,
    );
  });

  it("is null when there is neither", () => {
    expect(resolveBuildSha({}, () => null)).toBeNull();
  });

  it("rejects a value that is not a commit SHA", () => {
    expect(
      resolveBuildSha({ VERCEL_GIT_COMMIT_SHA: "oops" }, () => null),
    ).toBeNull();
    expect(resolveBuildSha({}, () => "fatal: not a git repository")).toBeNull();
  });
});

describe("GET /api/build", () => {
  it("returns the SHA and is never cached", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = SHA;
    const { GET, dynamic } = await import("../app/api/build/route");
    const response = await GET();
    expect(await response.json()).toEqual({ sha: SHA });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("client bundle", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("never imports the build stamp from a client module", () => {
    const offenders = files("src")
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return /^["']use client["']/m.test(text) && /lib\/build["']/.test(text);
      });
    expect(offenders).toEqual([]);
  });

  it("does not inline the SHA through next.config env", () => {
    expect(readFileSync("next.config.ts", "utf8")).not.toMatch(
      /\benv\s*:|NEXT_PUBLIC_.*(SHA|COMMIT)/,
    );
  });
});
