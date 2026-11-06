import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sampleDir = path.resolve("public/vault");
const files = readdirSync(sampleDir);
const notes = files.filter((f) => f.endsWith(".md"));
const read = (note: string) => readFileSync(path.join(sampleDir, note), "utf8");
const all = notes.map(read).join("\n");

describe("sample Vault", () => {
  it("demonstrates every supported feature", () => {
    expect(all).toMatch(/\[\[[^\]|#]+\|[^\]]+\]\]/); // Alias
    expect(all).toMatch(/\[\[[^\]|]*#[^\]|^]+/); // heading Subpath
    expect(all).toMatch(/\[\[[^\]|]*#\^/); // Block Reference
    expect(all).toMatch(/!\[\[/); // Embed
    expect(all).toMatch(/> \[!\w+\]/); // Callout
    expect(all).toMatch(/==🔴/); // Highlight Color
    expect(all).toMatch(/%%/); // Comment
    expect(all).toMatch(/ \^[\w-]+$/m); // Block ID
    expect(read("Properties.md")).toMatch(/^related:/m); // Properties
  });

  it("resolves every link except the deliberately unresolved ones", () => {
    const targets = new Set([
      ...notes.map((n) => n.replace(/\.md$/, "")),
      ...files,
    ]);
    const unresolved = new Set(["Nowhere", "Missing Note"]);
    const missing: string[] = [];
    for (const m of all.matchAll(/!?\[\[([^\]|#]*)/g)) {
      const target = m[1];
      if (target && !targets.has(target) && !unresolved.has(target)) {
        missing.push(target);
      }
    }
    expect(missing).toEqual([]);
  });
});
