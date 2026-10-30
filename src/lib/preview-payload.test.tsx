import { describe, expect, it } from "vitest";

import { buildPreviewPayload } from "@/lib/preview-payload";

describe("buildPreviewPayload", () => {
  it("returns nothing for a Slug that is not a Note", async () => {
    expect(await buildPreviewPayload(["no-such-note"])).toBeUndefined();
  });

  it("returns the title and the Properties split out of the body", async () => {
    const payload = await buildPreviewPayload(["beta-note"]);

    expect(payload?.title).toBe("Beta Note");
    expect(payload?.properties).toMatchObject({
      status: "draft",
      rating: 4,
      related: { url: "/alpha-note", label: "Alpha Note" },
    });
    expect(payload?.html).not.toContain("status");
    expect(payload?.html).not.toContain("draft");
  });

  it("renders the body to HTML", async () => {
    const payload = await buildPreviewPayload(["alpha-note"]);

    expect(payload?.html).toContain(
      '<h1 id="alpha-heading">Alpha heading</h1>',
    );
    expect(payload?.html).toContain("<p>Body of the alpha note.</p>");
  });

  it("transcludes Embeds and renders Callouts, Highlights and math", async () => {
    const html = (await buildPreviewPayload(["rich-note"]))?.html ?? "";

    expect(html).toContain("Body of the alpha note.");
    expect(html).toContain("Callout body text.");
    expect(html).toContain("<mark");
    expect(html).toContain("katex");
  });

  it("resolves Wiki Links to published Slugs and leaves unresolved ones unresolved", async () => {
    const html = (await buildPreviewPayload(["links-note"]))?.html ?? "";

    expect(html).toContain('href="/beta-note"');
    expect(html).toContain('href="/alpha-note#alpha-heading"');
    expect(html).toMatch(
      /<a [^>]*class="is-unresolved"[^>]*>Missing Note<\/a>/,
    );
  });

  describe("marking links that can be previewed", () => {
    const anchors = (html: string) => html.match(/<a [^>]*>/g) ?? [];
    const anchorTo = (html: string, href: string) =>
      anchors(html).find((a) => a.includes(`href="${href}"`)) ?? "";

    it("marks a link to a Vault Note with the target's Slug", async () => {
      const html = (await buildPreviewPayload(["links-note"]))?.html ?? "";

      expect(anchorTo(html, "/beta-note")).toContain(
        'data-preview-slug="beta-note"',
      );
    });

    it("carries the Subpath of the link", async () => {
      const html = (await buildPreviewPayload(["links-note"]))?.html ?? "";

      expect(anchorTo(html, "/alpha-note#alpha-heading")).toContain(
        'data-preview-slug="alpha-note"',
      );
      expect(anchorTo(html, "/alpha-note#alpha-heading")).toContain(
        'data-preview-subpath="alpha-heading"',
      );
    });

    it("does not mark unresolved, Asset, external, same-Note or non-Vault links", async () => {
      const html = (await buildPreviewPayload(["links-note"]))?.html ?? "";
      const betaHtml = (await buildPreviewPayload(["beta-note"]))?.html ?? "";
      expect(betaHtml).toContain('href="#beta-heading"');
      expect(
        anchors(betaHtml).some((a) => a.includes("data-preview-slug")),
      ).toBe(true);
      const unmarked = anchors(html).filter(
        (a) => !a.includes("data-preview-slug"),
      );

      expect(unmarked.some((a) => a.includes("is-unresolved"))).toBe(true);
      expect(unmarked.some((a) => a.includes("pic.png"))).toBe(true);
      expect(unmarked.some((a) => a.includes("https://example.com"))).toBe(
        true,
      );
      expect(unmarked.some((a) => a.includes('href="/api/search"'))).toBe(true);
      expect(unmarked.some((a) => a.includes('href="#anchors"'))).toBe(true);
    });

    it("does not mark a link back to the Note being previewed", async () => {
      const html = (await buildPreviewPayload(["beta-note"]))?.html ?? "";
      expect(html).toContain("beta self link");
      expect(html).not.toContain('data-preview-slug="beta-note"');
    });
  });
});
