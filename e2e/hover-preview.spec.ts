import { expect, type Page, test } from "@playwright/test";

const preview = (page: Page) => page.getByTestId("hover-preview");

/** The Note body, so sidebar links with the same name are not matched. */
const note = (page: Page) => page.locator(".markdown-rendered").first();

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

test("a link with a Subpath still previews its Note and carries the Subpath", async ({
  page,
}) => {
  await openNote(page, "/links-note");
  const link = note(page).getByRole("link", { name: "Alpha Note" });
  await expect(link).toHaveAttribute("data-subpath", "alpha-heading");
  await link.hover();
  await expect(
    preview(page).getByText("Body of the alpha note."),
  ).toBeVisible();
});

test("the preview renders Callouts, Highlights, math and Embeds", async ({
  page,
}) => {
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Rich Note" }).hover();
  const popup = preview(page);

  await expect(popup.locator(".markdown-rendered")).toBeVisible();
  await expect(popup.locator(".callout")).toContainText("Callout body text.");
  await expect(popup.locator("mark")).toHaveText("marked text");
  await expect(popup.locator(".katex")).toBeVisible();
  await expect(popup.getByText("Body of the alpha note.")).toBeVisible();
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
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/preview/")) requests.push(request.url());
  });

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

test("shows a loading state, then a failure state when the payload cannot load", async ({
  page,
}) => {
  await page.route("**/api/preview/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ status: 500, body: "boom" });
  });
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Beta Note" }).hover();

  await expect(preview(page).getByText("Loading preview")).toBeVisible();
  await expect(preview(page).getByText("Preview unavailable")).toBeVisible();
});

test("a long Note is capped in height and scrolls inside the preview", async ({
  page,
}) => {
  await openNote(page, "/links-note");
  await note(page).getByRole("link", { name: "Long Note" }).hover();
  const popup = preview(page);
  await expect(popup.getByText("Last line")).toBeAttached();

  const { client, scroll } = await popup.evaluate((el) => ({
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
