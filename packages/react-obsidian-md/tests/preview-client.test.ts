import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchPreviewPayload, slugKey } from "../src/index.js";

const payload = { title: "T", properties: {}, html: "<p>x</p>" };
const url = (slug: readonly string[]) => `/p/${slugKey(slug)}`;

describe("fetchPreviewPayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads a Note once however many times it is asked for", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json(payload));

    const [a, b] = await Promise.all([
      fetchPreviewPayload(["once"], url),
      fetchPreviewPayload(["once"], url),
    ]);

    expect(a).toEqual(payload);
    expect(b).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/p/once");
  });

  it("forgets a failed request so a later call retries", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("no", { status: 500 }))
      .mockImplementation(async () => Response.json(payload));

    await expect(fetchPreviewPayload(["flaky"], url)).rejects.toThrow();
    await expect(fetchPreviewPayload(["flaky"], url)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
