import { expect, type Page, test } from "@playwright/test";

import { FAKE_GITHUB_URL, PROD_PORT } from "./support/config";
import { signInAs } from "./support/sign-in";

const BASE = `http://localhost:${PROD_PORT}`;
// A well-formed SHA the fake does not know: the build never catches up.
const UNKNOWN_BUILD = "a".repeat(40);

const control = (path: string, body?: unknown) =>
  fetch(`${FAKE_GITHUB_URL}/__test/${path}`, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).then((response) => response.json());

const commits = () =>
  control("state").then(
    (state: { commits: { sha: string }[] }) => state.commits,
  );

// Lock poll timings come from playwright.config.ts (timeout 2.5 s).
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await control("reset", {});
  await signInAs(context, BASE);
});

const toast = (page: Page) => page.locator("[data-sonner-toast]");

async function openEditor(page: Page) {
  await page.goto("/edit/alpha-note");
  await expect(page.getByTestId("editor").locator(".cm-content")).toBeVisible();
  await expect(page.getByTestId("editor-loading")).toHaveCount(0);
}

async function type(page: Page, text = " Edited.") {
  await page.getByTestId("editor").locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

async function commit(page: Page) {
  await page.getByRole("button", { name: "Save" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Commit" })
    .click();
}

test("Save is disabled when clean and enabled when dirty", async ({ page }) => {
  await openEditor(page);
  const save = page.getByRole("button", { name: "Save" });
  const status = page.getByTestId("status");
  await expect(save).toBeDisabled();
  await expect(status).toHaveText("All changes saved");

  await type(page);
  await expect(save).toBeEnabled();
  await expect(status).toHaveText("Unsaved changes");
});

test("the toast waits for the deploy, then becomes Deployed with View note", async ({
  page,
}) => {
  await control("build-sha", { sha: UNKNOWN_BUILD });
  await openEditor(page);
  await type(page);
  await commit(page);

  await expect(toast(page)).toContainText("Committed. Waiting for the deploy…");
  await expect(toast(page).getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("status")).toHaveText("Saved, deploying");

  const [saved] = await commits();
  await control("build-sha", { sha: saved?.sha });

  await expect(toast(page)).toHaveCount(1);
  await expect(toast(page)).toContainText("Deployed");
  await expect(page.getByTestId("status")).toHaveText("Saved");
  await toast(page).getByRole("button", { name: "View note" }).click();
  await expect(page).toHaveURL(/\/alpha-note$/);
});

test("a lock timeout leaves the toast without an action", async ({ page }) => {
  await control("build-sha", { sha: UNKNOWN_BUILD });
  await openEditor(page);
  await type(page);
  await commit(page);
  await expect(toast(page)).toContainText("Committed. Waiting for the deploy…");

  await expect(page.getByTestId("lock-timeout")).toBeVisible({
    timeout: 10_000,
  });
  await expect(toast(page)).not.toContainText("Waiting for the deploy");
  await expect(toast(page).getByRole("button")).toHaveCount(0);
});

test("a host with no build commit confirms the Save without an action", async ({
  page,
}) => {
  await openEditor(page); // the fake reports no deployed commit
  await type(page);
  await commit(page);

  await expect(toast(page)).toContainText("Saved Alpha Note");
  await expect(toast(page).getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("status")).toHaveText("Saved");
});

test("Ctrl/Cmd+S opens the commit dialog from anywhere on the page", async ({
  page,
}) => {
  await openEditor(page);
  await type(page);
  await page.getByRole("button", { name: "Save" }).focus();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("commit-subject")).toHaveValue(
    "Update Alpha Note.md",
  );
});

test("a failed Save raises an error toast and keeps the message", async ({
  page,
}) => {
  await openEditor(page);
  await control("reject-token", { on: true });
  await type(page, " Kept.");
  await commit(page);

  await expect(toast(page)).toContainText("Could not save Alpha Note");
  await expect(page.getByTestId("save-error")).toBeVisible();
  await expect(page.getByTestId("status")).toHaveText("Save failed");
});

test("the commit dialog traps focus and Esc cancels", async ({ page }) => {
  await openEditor(page);
  await type(page);
  await page.getByRole("button", { name: "Save" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() =>
      document
        .querySelector('[role="dialog"]')
        ?.contains(document.activeElement),
    );
    expect(inside).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await commits()).toHaveLength(0);
});
