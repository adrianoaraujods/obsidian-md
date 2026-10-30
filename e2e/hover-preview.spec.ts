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
