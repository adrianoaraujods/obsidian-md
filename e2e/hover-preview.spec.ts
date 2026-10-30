import { existsSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { PREVIEW_PATH } from "../src/lib/preview-types";
import { PREVIEW_PROPERTIES_KEY } from "../src/lib/properties-keys";

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
  await page.waitForTimeout(100);
  await expect(preview(page)).toHaveCount(0);

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
  await page.waitForTimeout(400);
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
    await page.waitForTimeout(600);
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

test("links inside a preview are plain links", async ({ page }) => {
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Rich Note" }).hover();
  const inner = preview(page).getByRole("link", { name: "Beta Note" });
  await expect(inner).toBeVisible();
  await inner.hover();
  await page.waitForTimeout(600);
  await expect(preview(page)).toHaveCount(1);
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
  let requestedAt = 0;
  await page.route(`**${PREVIEW_PATH}beta-note*`, async (route) => {
    requestedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await openNote(page, "/links-note");
  const hoveredAt = Date.now();
  await note(page).getByRole("link", { name: "Beta Note" }).hover();

  // The fetch starts with the hover, not when the 300 ms open delay ends.
  await expect.poll(() => requestedAt).toBeGreaterThan(0);
  expect(requestedAt - hoveredAt).toBeLessThan(250);

  // Past the open delay but before the payload: nothing at all is rendered.
  await page.waitForTimeout(600);
  await expect(preview(page)).toHaveCount(0);
  await expect(page.getByText("Loading preview")).toHaveCount(0);

  await expect(preview(page).getByText("Body of the beta note.")).toBeVisible();
});

test("leaving the link before the payload arrives means the preview never opens", async ({
  page,
}) => {
  await page.route(`**${PREVIEW_PATH}beta-note*`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Beta Note" }).hover();
  await page.waitForTimeout(400);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(1200);
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
  await page.waitForTimeout(800);
  await expect(preview(page)).toHaveCount(0);
  await expect(page.getByText("Preview unavailable")).toHaveCount(0);
  expect(calls).toBe(1);

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
