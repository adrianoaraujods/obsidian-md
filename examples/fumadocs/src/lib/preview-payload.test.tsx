import { PREVIEW_SLUG_ATTR, PREVIEW_SUBPATH_ATTR } from "react-obsidian-md";
import { describe, expect, it } from "vitest";
import { buildPreviewPayload } from "@/lib/preview-payload";

const htmlOf = async (slug: string[]) =>
  (await buildPreviewPayload(slug))?.html ?? "";

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
    const html = await htmlOf(["rich-note"]);

    expect(html).toContain("Body of the alpha note.");
    expect(html).toContain("Callout body text.");
    expect(html).toContain("<mark");
    expect(html).toContain("katex");
  });

  it("resolves Wiki Links to published Slugs and leaves unresolved ones unresolved", async () => {
    const html = await htmlOf(["links-note"]);

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
    const isMarked = (anchor: string) => anchor.includes(PREVIEW_SLUG_ATTR);

    it("marks a link to a Vault Note with the target's Slug", async () => {
      const html = await htmlOf(["links-note"]);

      expect(anchorTo(html, "/beta-note")).toContain(
        `${PREVIEW_SLUG_ATTR}="beta-note"`,
      );
    });

    it("carries the Subpath of the link", async () => {
      const anchor = anchorTo(
        await htmlOf(["links-note"]),
        "/alpha-note#alpha-heading",
      );

      expect(anchor).toContain(`${PREVIEW_SLUG_ATTR}="alpha-note"`);
      expect(anchor).toContain(`${PREVIEW_SUBPATH_ATTR}="alpha-heading"`);
    });

    it("does not mark unresolved, Asset, external, same-Note or non-Vault links", async () => {
      const unmarked = anchors(await htmlOf(["links-note"])).filter(
        (a) => !isMarked(a),
      );
      const has = (text: string) => unmarked.some((a) => a.includes(text));

      expect(has("is-unresolved")).toBe(true);
      expect(has("pic.png")).toBe(true);
      expect(has("https://example.com")).toBe(true);
      expect(has('href="/api/search"')).toBe(true);
      expect(has('href="#anchors"')).toBe(true);
    });

    it("does not mark a link back to the Note being previewed", async () => {
      const html = await htmlOf(["beta-note"]);

      expect(html).toContain("beta self link");
      expect(html).not.toContain(`${PREVIEW_SLUG_ATTR}="beta-note"`);
    });

    it("still marks a link from B back to A; only a direct self-link is excluded", async () => {
      // Ping links to Pong and Pong links back to Ping: previewing Ping, then
      // Pong inside it, offers Ping again.
      expect(anchorTo(await htmlOf(["ping-note"]), "/pong-note")).toContain(
        `${PREVIEW_SLUG_ATTR}="pong-note"`,
      );
      expect(anchorTo(await htmlOf(["pong-note"]), "/ping-note")).toContain(
        `${PREVIEW_SLUG_ATTR}="ping-note"`,
      );
    });
  });
});
