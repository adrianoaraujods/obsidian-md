import { describe, expect, it } from "vitest";

import { slicePreviewHtml } from "@/lib/preview-slice";

const NOTE = [
  "<p>Intro paragraph.</p>",
  '<h1 id="top">Top</h1>',
  "<p>Under top.</p>",
  '<h2 id="first">First</h2>',
  "<p>Under first.</p>",
  '<h3 id="deep">Deep</h3>',
  "<p>Under deep.</p>",
  '<h2 id="second">Second</h2>',
  "<p>Under second.</p>",
  '<h1 id="other">Other</h1>',
  "<p>Under other.</p>",
  '<p id="^para">A tagged paragraph.</p>',
  '<h2 id="^head">Tagged heading</h2>',
  '<ul><li>One</li><li id="^item">Two</li></ul>',
].join("");

describe("slicePreviewHtml", () => {
  it("returns the whole Note without a Subpath", () => {
    expect(slicePreviewHtml(NOTE, undefined)).toBe(NOTE);
    expect(slicePreviewHtml(NOTE, "")).toBe(NOTE);
  });

  it("selects a heading and everything up to the next heading of the same or higher level", () => {
    expect(slicePreviewHtml(NOTE, "first")).toBe(
      '<h2 id="first">First</h2><p>Under first.</p>' +
        '<h3 id="deep">Deep</h3><p>Under deep.</p>',
    );
  });

  it("includes nested lower-level sections and stops at a higher level", () => {
    expect(slicePreviewHtml(NOTE, "second")).toBe(
      '<h2 id="second">Second</h2><p>Under second.</p>',
    );
    expect(slicePreviewHtml(NOTE, "top")).toContain("Under second.");
    expect(slicePreviewHtml(NOTE, "top")).not.toContain("Under other.");
  });

  it("selects a deeper heading alone up to the next heading", () => {
    expect(slicePreviewHtml(NOTE, "deep")).toBe(
      '<h3 id="deep">Deep</h3><p>Under deep.</p>',
    );
  });

  it("runs the last section to the end of the Note", () => {
    const html = slicePreviewHtml(NOTE, "other");
    expect(html.startsWith('<h1 id="other">Other</h1>')).toBe(true);
    expect(html).toContain("A tagged paragraph.");
    expect(html).toContain("<li>One</li>");
  });

  it("selects the one paragraph carrying a Block ID", () => {
    expect(slicePreviewHtml(NOTE, "^para")).toBe(
      '<p id="^para">A tagged paragraph.</p>',
    );
  });

  it("selects only the heading carrying a Block ID", () => {
    expect(slicePreviewHtml(NOTE, "^head")).toBe(
      '<h2 id="^head">Tagged heading</h2>',
    );
  });

  it("selects the list item carrying a Block ID, kept inside its list", () => {
    expect(slicePreviewHtml(NOTE, "^item")).toBe(
      '<ul><li id="^item">Two</li></ul>',
    );
  });

  it("falls back to the whole Note when the anchor is missing", () => {
    expect(slicePreviewHtml(NOTE, "nope")).toBe(NOTE);
    expect(slicePreviewHtml(NOTE, "^nope")).toBe(NOTE);
  });

  it("matches percent-encoded Subpaths", () => {
    const html = '<h2 id="café">Café</h2><p>x</p>';
    expect(slicePreviewHtml(html, "caf%C3%A9")).toBe(html);
  });

  it("does not need a browser DOM", () => {
    expect(typeof document).toBe("undefined");
  });
});
