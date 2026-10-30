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
});
