// PROTOTYPE: bundles src/main.js and inlines it into index.html (double-click to open).
import { build } from "esbuild";
import { writeFileSync, readFileSync } from "node:fs";
const r = await build({ entryPoints: ["src/main.js"], bundle: true, minify: true, format: "iife", write: false });
const html = readFileSync("src/template.html", "utf8").replace("/*BUNDLE*/", () => r.outputFiles[0].text);
writeFileSync("index.html", html);
console.log("wrote index.html — open it in a browser");
