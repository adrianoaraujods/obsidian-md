import { existsSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { PREVIEW_PROPERTIES_KEY } from "react-obsidian-md";
import { PREVIEW_PATH } from "../src/lib/preview-types";

const preview = (page: Page) => page.getByTestId("hover-preview");

/** The Note body, so sidebar links with the same name are not matched. */
const note = (page: Page) => page.locator(".markdown-rendered").first();

/** Records the URLs of every Preview Payload the page downloads. */
function recordPayloadRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(PREVIEW_PATH)) requests.push(request.url());
  });
  return requests;
}

/**
 * Lets the open and close delays (300 ms and 150 ms) run out, for asserting
 * that something did not happen. Where something does happen, wait for it
 * with an assertion instead.
 */
const PAST_DELAYS = 600;
const letDelaysPass = (page: Page) => page.waitForTimeout(PAST_DELAYS);

/** Lets React apply what a just-settled request or event changed. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

/**
 * Holds the Preview Payload of `slug` back for `ms`. `requestedAt()` is when
 * the page asked for it (0 if it has not).
 */
async function delayPayload(page: Page, slug: string, ms: number) {
  let requestedAt = 0;
  await page.route(`**${PREVIEW_PATH}${slug}*`, async (route) => {
    requestedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
  return { requestedAt: () => requestedAt };
}

/** Waits for hydration, so the hover handlers exist before the pointer moves. */
async function openNote(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test("hovering a link to a Note previews that Note after a short delay", async ({
  page,
}) => {
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Beta Note" }).hover();

  // Not instant: moving the pointer across the page must not flash popovers.
  await expect(preview(page)).toHaveCount(0, { timeout: 0 });

  await expect(preview(page)).toBeVisible();
  await expect(preview(page).getByText("Body of the beta note.")).toBeVisible();
});

test("the preview stays open while the pointer moves into it, then closes", async ({
  page,
}) => {
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Beta Note" }).hover();
  await expect(preview(page)).toBeVisible();

  const box = await preview(page).boundingBox();
  if (!box) throw new Error("preview has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 8 });
  await letDelaysPass(page);
  await expect(preview(page)).toBeVisible();

  await page.mouse.move(2, 2);
  await expect(preview(page)).toHaveCount(0);
});

test("keyboard focus opens the preview and Escape closes it", async ({
  page,
}) => {
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Beta Note" }).focus();
  await expect(preview(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(preview(page)).toHaveCount(0);
});

test("links that resolve to no Vault Note get no preview", async ({ page }) => {
  await openNote(page, "/links-note");
  const links = [
    note(page).getByRole("link", { name: "Missing Note" }),
    note(page).getByRole("link", { name: "pic.png" }),
    note(page).getByRole("link", { name: "Picture file" }),
    note(page).getByRole("link", { name: "Example" }),
    note(page).getByRole("link", { name: "Search" }),
    note(page).getByRole("link", { name: "Anchors" }).first(),
  ];

  // Positive control: the same wait on an eligible link does open a preview.
  await note(page).getByRole("link", { name: "Beta Note" }).hover();
  await expect(preview(page)).toBeVisible();
  await page.mouse.move(2, 2);
  await expect(preview(page)).toHaveCount(0);

  for (const link of links) {
    await link.hover();
    await letDelaysPass(page);
    await expect(preview(page)).toHaveCount(0);
  }
});

test("a link with a Subpath still previews its Note", async ({ page }) => {
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Alpha Note" }).hover();
  await expect(
    preview(page).getByText("Body of the alpha note."),
  ).toBeVisible();
});

test("the preview renders Callouts, Highlights, math and Embeds", async ({
  page,
}) => {
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Rich Note" }).hover();
  const hoverPreview = preview(page);

  await expect(hoverPreview.locator(".markdown-rendered")).toBeVisible();
  await expect(hoverPreview.locator(".callout")).toContainText(
    "Callout body text.",
  );
  await expect(hoverPreview.locator("mark")).toHaveText("marked text");
  await expect(hoverPreview.locator(".katex")).toBeVisible();
  await expect(hoverPreview.getByText("Body of the alpha note.")).toBeVisible();
});

test.describe("nested previews", () => {
  const previews = (page: Page) => page.getByTestId("hover-preview");
  const inside = (page: Page, depth: number, name: string) =>
    previews(page).nth(depth).getByRole("link", { name });

  /** Opens Rich Note's preview, then Beta Note's inside it. */
  async function openTwoLevels(page: Page) {
    await openNote(page, "/links-note");
    await note(page).getByRole("link", { name: "Rich Note" }).hover();
    await expect(previews(page)).toHaveCount(1);
    await inside(page, 0, "Beta Note").hover();
    await expect(previews(page)).toHaveCount(2);
  }

  test("a link inside a preview opens a nested preview", async ({ page }) => {
    await openTwoLevels(page);
    await expect(
      previews(page).nth(1).getByText("Body of the beta note."),
    ).toBeVisible();
  });

  test("a third level opens from the second, with no depth limit", async ({
    page,
  }) => {
    await openTwoLevels(page);
    await inside(page, 1, "beta to alpha child").hover();
    await expect(previews(page)).toHaveCount(3);
    await expect(
      previews(page).nth(2).getByText("Body of the alpha child."),
    ).toBeVisible();
    await expect(
      previews(page).nth(2).getByText("Body of the alpha sibling."),
    ).toHaveCount(0);
  });

  test("a nested link carries its Subpath", async ({ page }) => {
    await openTwoLevels(page);
    await inside(page, 1, "beta to alpha block").hover();
    await expect(
      previews(page).nth(2).getByText("A tagged alpha paragraph."),
    ).toBeVisible();
    await expect(
      previews(page).nth(2).getByText("Body of the alpha note."),
    ).toHaveCount(0);
  });

  test("moving into the nested preview keeps the parent open; leaving closes all", async ({
    page,
  }) => {
    await openTwoLevels(page);
    const box = await previews(page).nth(1).boundingBox();
    if (!box) throw new Error("nested preview has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 10 });
    await letDelaysPass(page);
    await expect(previews(page)).toHaveCount(2);

    await page.mouse.move(2, 2);
    await expect(previews(page)).toHaveCount(0);
  });

  test("Escape closes the innermost preview first", async ({ page }) => {
    await openNote(page, "/links-note");
    await note(page).getByRole("link", { name: "Rich Note" }).focus();
    await expect(previews(page)).toHaveCount(1);
    await inside(page, 0, "Beta Note").focus();
    await expect(previews(page)).toHaveCount(2);

    await page.keyboard.press("Escape");
    await expect(previews(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(previews(page)).toHaveCount(0);
  });

  test("focus inside a preview keeps it open when its nested preview closes", async ({
    page,
  }) => {
    await openNote(page, "/links-note");
    await note(page).getByRole("link", { name: "Beta Note" }).focus();
    await expect(previews(page)).toHaveCount(1);
    await inside(page, 0, "beta to alpha child").focus();
    await expect(previews(page)).toHaveCount(2);

    // Focus moves to another link of the parent: the nested one closes, but
    // focus is still inside the parent, so it must stay open.
    await inside(page, 0, "beta self link").focus();
    await expect(previews(page)).toHaveCount(1);
    await letDelaysPass(page);
    await expect(previews(page)).toHaveCount(1);
  });

  test("focus leaving a chain of nested previews closes all of them", async ({
    page,
  }) => {
    await openNote(page, "/links-note");
    await note(page).getByRole("link", { name: "Rich Note" }).focus();
    await expect(previews(page)).toHaveCount(1);
    await inside(page, 0, "Beta Note").focus();
    await expect(previews(page)).toHaveCount(2);

    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await expect(previews(page)).toHaveCount(0);
  });

  test("links inside a preview that point at no other Note get no preview", async ({
    page,
  }) => {
    await openTwoLevels(page);
    for (const name of [
      "beta self link",
      "beta anchor link",
      "Nowhere Note",
      "pic.png",
      "Example",
      "Search",
    ]) {
      await inside(page, 1, name).hover();
      await letDelaysPass(page);
      await expect(previews(page)).toHaveCount(2);
    }

    // Positive control: an eligible link in the same preview does open one.
    await inside(page, 1, "beta to alpha child").hover();
    await expect(previews(page)).toHaveCount(3);
  });

  test("the Properties Panel state is shared across levels", async ({
    page,
  }) => {
    // Beta Note and Alpha Note both have Properties.
    await openNote(page, "/links-note");
    await note(page).getByRole("link", { name: "Beta Note" }).hover();
    await expect(previews(page)).toHaveCount(1);
    await inside(page, 0, "beta to alpha child").hover();
    await expect(previews(page)).toHaveCount(2);
    const toggle = (depth: number) =>
      previews(page).nth(depth).getByRole("button", { name: "Properties" });
    await expect(toggle(1)).toHaveAttribute("aria-expanded", "false");
    await toggle(1).click();
    await expect(toggle(1)).toHaveAttribute("aria-expanded", "true");
    await expect(toggle(0)).toHaveAttribute("aria-expanded", "true");
  });

  test("Embeds, Callouts, Highlights and math render in a nested preview", async ({
    page,
  }) => {
    await openNote(page, "/links-note");
    await note(page).getByRole("link", { name: "Long Note" }).hover();
    await expect(previews(page)).toHaveCount(1);
    await inside(page, 0, "Rich Note").hover();
    await expect(previews(page)).toHaveCount(2);
    const nested = previews(page).nth(1);
    await expect(nested.locator(".callout")).toContainText(
      "Callout body text.",
    );
    await expect(nested.locator("mark")).toHaveText("marked text");
    await expect(nested.locator(".katex")).toBeVisible();
    await expect(nested.getByText("Body of the alpha note.")).toBeVisible();
  });
});

test("the preview's Properties Panel starts collapsed and the choice persists", async ({
  page,
}) => {
  await openNote(page, "/links-note");
  const hoverBeta = () =>
    note(page).getByRole("link", { name: "Beta Note" }).hover();

  await hoverBeta();
  const toggle = preview(page).getByRole("button", { name: "Properties" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(preview(page).getByText("draft")).toBeHidden();

  await toggle.click();
  await expect(preview(page).getByText("draft")).toBeVisible();

  // A later preview, of another Note, comes with the Properties expanded.
  await page.mouse.move(2, 2);
  await expect(preview(page)).toHaveCount(0);
  await note(page).getByRole("link", { name: "Alpha Note" }).hover();
  await expect(
    preview(page).getByRole("button", { name: "Properties" }),
  ).toHaveAttribute("aria-expanded", "true");
});

test("the page and the preview remember their Properties state separately", async ({
  page,
}) => {
  await openNote(page, "/beta-note");
  await page.getByRole("button", { name: "Properties" }).click(); // collapse the page's panel
  await expect(page.getByText("draft")).toBeHidden();

  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Beta Note" }).hover();
  await expect(
    preview(page).getByRole("button", { name: "Properties" }),
  ).toHaveAttribute("aria-expanded", "false");
  await preview(page).getByRole("button", { name: "Properties" }).click();

  await openNote(page, "/beta-note");
  await expect(
    page.getByRole("button", { name: "Properties" }),
  ).toHaveAttribute("aria-expanded", "false");
});

test("a Note is downloaded once, however many links point at it", async ({
  page,
}) => {
  const requests = recordPayloadRequests(page);

  await openNote(page, "/links-note");
  expect(requests).toHaveLength(0);

  await note(page).getByRole("link", { name: "Alpha Note" }).hover();
  await expect(preview(page)).toBeVisible();
  await page.mouse.move(2, 2);
  await expect(preview(page)).toHaveCount(0);
  await note(page).getByRole("link", { name: "Alpha Note" }).hover();
  await expect(preview(page)).toBeVisible();

  expect(requests).toHaveLength(1);
});

test("a slow payload is requested on hover and the preview opens only once it arrives", async ({
  page,
}) => {
  const payload = await delayPayload(page, "beta-note", 1000);
  await openNote(page, "/links-note");
  const hoveredAt = Date.now();
  await note(page).getByRole("link", { name: "Beta Note" }).hover();

  // The fetch starts with the hover, not when the 300 ms open delay ends.
  await expect.poll(payload.requestedAt).toBeGreaterThan(0);
  expect(payload.requestedAt() - hoveredAt).toBeLessThan(250);

  // Past the open delay but before the payload: nothing at all is rendered.
  await letDelaysPass(page);
  await expect(preview(page)).toHaveCount(0);
  await expect(page.getByText("Loading preview")).toHaveCount(0);

  await expect(preview(page).getByText("Body of the beta note.")).toBeVisible();
});

test("leaving the link before the payload arrives means the preview never opens", async ({
  page,
}) => {
  await delayPayload(page, "beta-note", 800);
  await openNote(page, "/links-note");
  const arrived = page.waitForResponse((r) => r.url().includes(PREVIEW_PATH));
  await note(page).getByRole("link", { name: "Beta Note" }).hover();
  await letDelaysPass(page);
  await page.mouse.move(2, 2);

  await arrived;
  await nextFrames(page);
  await expect(preview(page)).toHaveCount(0);
});

test("a failing payload opens nothing and the next hover retries", async ({
  page,
}) => {
  let calls = 0;
  await page.route(`**${PREVIEW_PATH}beta-note*`, async (route) => {
    calls += 1;
    if (calls === 1) await route.fulfill({ status: 500, body: "boom" });
    else await route.continue();
  });
  await openNote(page, "/links-note");
  const link = note(page).getByRole("link", { name: "Beta Note" });
  await link.hover();
  await expect.poll(() => calls).toBe(1);
  await letDelaysPass(page);
  await expect(preview(page)).toHaveCount(0);
  await expect(page.getByText("Preview unavailable")).toHaveCount(0);

  await page.mouse.move(2, 2);
  await link.hover();
  await expect(preview(page).getByText("Body of the beta note.")).toBeVisible();
  expect(calls).toBe(2);
});

test("a long Note is capped in height and scrolls inside the preview", async ({
  page,
}) => {
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Long Note" }).hover();
  const hoverPreview = preview(page);
  await expect(hoverPreview.getByText("Last line")).toBeAttached();

  const { client, scroll } = await hoverPreview.evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
  }));
  expect(client).toBeLessThan(scroll);
  expect(client).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
});

test.describe("touch", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("tapping a link navigates straight away", async ({ page }) => {
    await openNote(page, "/links-note");
    await note(page).getByRole("link", { name: "Beta Note" }).tap();
    await expect(page).toHaveURL(/\/beta-note$/);
    await expect(preview(page)).toHaveCount(0);
  });
});

test.describe("Subpaths", () => {
  test("a heading link previews only that section", async ({ page }) => {
    await openNote(page, "/links-note");
    await note(page).getByRole("link", { name: "child section" }).hover();

    await expect(
      preview(page).getByText("Body of the alpha child."),
    ).toBeVisible();
    await expect(
      preview(page).getByText("Body of the alpha note."),
    ).toHaveCount(0);
    await expect(
      preview(page).getByText("Body of the alpha sibling."),
    ).toHaveCount(0);
  });

  test("a Block ID link previews only that block", async ({ page }) => {
    await openNote(page, "/links-note");
    await note(page).getByRole("link", { name: "block link" }).hover();

    await expect(
      preview(page).getByText("A tagged alpha paragraph."),
    ).toBeVisible();
    await expect(
      preview(page).getByText("Body of the alpha note."),
    ).toHaveCount(0);
  });

  test("a Block ID on a list item previews that item", async ({ page }) => {
    await openNote(page, "/links-note");
    await note(page).getByRole("link", { name: "item link" }).hover();

    await expect(preview(page).getByText("Tagged alpha item")).toBeVisible();
    await expect(preview(page).getByText("First alpha item")).toHaveCount(0);
  });

  test("an anchor missing from the payload falls back to the whole Note", async ({
    page,
  }) => {
    // The plugin leaves links to unknown anchors unresolved, so a stale anchor
    // is simulated by removing the section from the downloaded payload.
    await page.route(`**${PREVIEW_PATH}alpha-note*`, async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.html = payload.html.replace('id="alpha-child"', "");
      await route.fulfill({ response, json: payload });
    });
    await openNote(page, "/links-note");
    await note(page).getByRole("link", { name: "child section" }).hover();

    await expect(
      preview(page).getByText("Body of the alpha note."),
    ).toBeVisible();
    await expect(
      preview(page).getByText("Body of the alpha sibling."),
    ).toBeVisible();
  });

  test("links with different Subpaths to one Note download it once", async ({
    page,
  }) => {
    const requests = recordPayloadRequests(page);
    await openNote(page, "/links-note");

    for (const name of ["child section", "block link", "item link"]) {
      await note(page).getByRole("link", { name }).hover();
      await expect(preview(page)).toBeVisible();
      await page.mouse.move(2, 2);
      await expect(preview(page)).toHaveCount(0);
    }

    expect(requests).toHaveLength(1);
  });
});

test("focus leaving the link closes the preview", async ({ page }) => {
  await openNote(page, "/links-note");
  const link = note(page).getByRole("link", { name: "Beta Note" });
  await link.focus();
  await expect(preview(page)).toBeVisible();

  await link.blur();
  await expect(preview(page)).toHaveCount(0);
});

test("the preview opens after the open delay and closes after the close delay", async ({
  page,
}) => {
  await openNote(page, "/links-note");

  const hoverStart = Date.now();
  await note(page).getByRole("link", { name: "Beta Note" }).hover();
  await expect(preview(page)).toBeVisible();
  // Delay is 300ms; the tolerance covers the pointer landing a bit early.
  expect(Date.now() - hoverStart).toBeGreaterThanOrEqual(200);

  const leaveStart = Date.now();
  await page.mouse.move(2, 2);
  // Delay is 150ms: right after the pointer leaves, the preview is still there.
  await expect(preview(page)).toHaveCount(1, { timeout: 0 });
  await expect(preview(page)).toHaveCount(0);
  expect(Date.now() - leaveStart).toBeGreaterThanOrEqual(100);
});

test("the preview's Properties state syncs between tabs", async ({
  context,
  page,
}) => {
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Beta Note" }).hover();
  const toggle = preview(page).getByRole("button", { name: "Properties" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  const other = await context.newPage();
  await openNote(other, "/links-note");
  await note(other).getByRole("link", { name: "Beta Note" }).hover();
  await preview(other).getByRole("button", { name: "Properties" }).click();
  expect(
    await other.evaluate(
      (key) => localStorage.getItem(key),
      PREVIEW_PROPERTIES_KEY,
    ),
  ).toBe("1");

  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("a Mermaid diagram renders inside a preview", async ({ page }) => {
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Mermaid Note" }).hover();

  await expect(preview(page).locator("svg").getByText("Finish")).toBeVisible();
});

test("Note pages and Preview Payloads are statically generated", () => {
  // The fixture build wrote them to disk, so no request renders them.
  const app = path.join(process.cwd(), ".next/server/app");
  expect(existsSync(path.join(app, "alpha-note.html"))).toBe(true);
  expect(existsSync(path.join(app, "api/preview/alpha-note.body"))).toBe(true);
});
