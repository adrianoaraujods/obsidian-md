import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import * as main from "../src/index.js";
import * as syntax from "../src/syntax.js";

const root = resolve(import.meta.dirname, "..");

describe("/syntax entry", () => {
  it("exports the micromark extensions, plugins and pure helpers", () => {
    expect(Object.keys(syntax)).toEqual(
      expect.arrayContaining([
        "wikiLinkSyntax",
        "wikiLinkFromMarkdown",
        "embedSyntax",
        "embedFromMarkdown",
        "commentSyntax",
        "commentFromMarkdown",
        "highlightSyntax",
        "highlightFromMarkdown",
        "footnoteSyntax",
        "footnoteFromMarkdown",
        "remarkObsidianMd",
        "parseWikiLink",
        "slugify",
        "mapResolver",
        "CALLOUT_TYPES",
        "CALLOUT_ALIASES",
        "HIGHLIGHT_COLORS",
        "scanBlockIds",
        "getFrontmatter",
        "createSlugifyPath",
      ]),
    );
  });

  it("parses Obsidian syntax with the plugin it exports", () => {
    const processor = unified()
      .use(remarkParse)
      .use(syntax.remarkObsidianMd, {
        resolver: syntax.mapResolver({ Target: { path: "/Target.md" } }),
      });

    expect(
      JSON.stringify(processor.runSync(processor.parse("[[Target]]"))),
    ).toContain('"url":"/target"');
  });

  it("is re-exported by the main entry, which keeps its Node-only exports", () => {
    for (const name of Object.keys(syntax)) {
      expect(main, name).toHaveProperty(name);
    }
    expect(main.default).toBe(syntax.remarkObsidianMd);
    expect(main).toHaveProperty("filesystemResolver");
    expect(main).toHaveProperty("filesystemPropertyTypes");
    expect(syntax).not.toHaveProperty("filesystemResolver");
    expect(syntax).not.toHaveProperty("filesystemPropertyTypes");
  });

  it("is published as the ./syntax subpath", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

    expect(pkg.exports["./syntax"]).toBe("./dist/syntax.js");
  });

  it("bundles for the browser without a Node built-in or Node-only module", async () => {
    // esbuild fails the build when a browser bundle imports `node:*`.
    const result = await build({
      entryPoints: [resolve(root, "src/syntax.ts")],
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      metafile: true,
      logLevel: "silent",
    });

    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.some((input) => /node:/.test(input))).toBe(false);
    expect(inputs.some((input) => /src\/resolver\.ts$/.test(input))).toBe(
      false,
    );
    expect(inputs.some((input) => /src\/property-types\.ts$/.test(input))).toBe(
      false,
    );
  });
});
