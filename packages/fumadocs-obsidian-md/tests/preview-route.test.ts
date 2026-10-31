import { PREVIEW_PATH, previewPayloadUrl } from "react-obsidian-md";
import { beforeAll, describe, expect, it } from "vitest";

import { createPreviewRoute } from "../src/next/index.js";
import { createFixtureSource } from "./helpers/fixture-source.js";

let route: ReturnType<typeof createPreviewRoute>;
beforeAll(async () => {
  route = createPreviewRoute(await createFixtureSource("preview-vault"));
});

/** Calls the route the way Next.js does for a client-built payload URL. */
async function get(slug: string[]) {
  const url = previewPayloadUrl(slug);
  expect(url.startsWith(PREVIEW_PATH)).toBe(true);
  const segments = url.slice(PREVIEW_PATH.length).split("/").filter(Boolean);
  return route.GET(new Request(`http://localhost${url}`), {
    params: Promise.resolve({ slug: segments.length ? segments : undefined }),
  });
}

describe("createPreviewRoute", () => {
  it("serves the payload at the URL react-obsidian-md fetches", async () => {
    const response = await get(["beta-note"]);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: "Beta Note" });
  });

  it("answers 404 for a Slug that is not a Note", async () => {
    expect((await get(["no-such-note"])).status).toBe(404);
  });

  it("prerenders one payload per Note", () => {
    const params = route.generateStaticParams();
    expect(params).toContainEqual({ slug: ["beta-note"] });
  });
});
