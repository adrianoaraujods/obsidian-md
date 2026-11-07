import { expect, type Page, test } from "@playwright/test";

import { FAKE_GITHUB_URL, PROD_PORT } from "./support/config";
import { signInAs } from "./support/sign-in";

const BASE = `http://localhost:${PROD_PORT}`;
// A well-formed SHA the fake does not know: the build is "deployed" but is not
// at or after any Save, so the Note stays locked.
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

// The poll timings are set in playwright.config.ts: first poll 100 ms, then
// every 150 ms, timeout 2.5 s.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await control("reset", {});
  await signInAs(context, BASE);
});

async function openEditor(page: Page) {
  await page.goto("/edit/alpha-note");
  await expect(page.getByTestId("editor").locator(".cm-content")).toBeVisible();
  await expect(page.getByTestId("editor-loading")).toHaveCount(0);
}

async function saveEdit(page: Page) {
  await page.getByTestId("editor").locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Edited.");
  await page.getByRole("button", { name: "Save" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Commit" })
    .click();
}

test("Save locks the Note until the deploy reaches the saved commit", async ({
  page,
}) => {
  await control("build-sha", { sha: UNKNOWN_BUILD });
  await openEditor(page);
  await saveEdit(page);

  await expect(page.getByTestId("lock-locked")).toBeVisible();
  await expect(page.getByTestId("editor")).toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();

  const [saved] = await commits();
  await control("build-sha", { sha: saved?.sha });

  await expect(page.getByTestId("lock-locked")).toHaveCount(0);
  await expect(page.getByTestId("editor")).not.toHaveAttribute("inert", "");
});

test("a diverged deploy keeps the Note locked, then offers Reload and Keep waiting", async ({
  page,
}) => {
  await control("build-sha", { sha: UNKNOWN_BUILD });
  await openEditor(page);
  await saveEdit(page);
  await control("build-sha", { sha: "diverged" });

  const timeout = page.getByTestId("lock-timeout");
  await expect(timeout).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("lock-locked")).toHaveCount(0);
  await expect(page.getByTestId("editor")).toHaveAttribute("inert", "");
  await expect(
    timeout.getByRole("button", { name: "Reload from GitHub" }),
  ).toBeVisible();

  await timeout.getByRole("button", { name: "Keep waiting" }).click();
  await expect(page.getByTestId("lock-locked")).toBeVisible();

  const [saved] = await commits();
  await control("build-sha", { sha: saved?.sha });
  await expect(page.getByTestId("lock-locked")).toHaveCount(0);
  await expect(page.getByTestId("editor")).not.toHaveAttribute("inert", "");
});

test("a null build shows a one-time notice and never locks", async ({
  page,
}) => {
  await openEditor(page); // the fake reports no deployed commit
  await saveEdit(page);

  const notice = page.getByTestId("lock-notice");
  await expect(notice).toBeVisible();
  await expect(page.getByTestId("lock-locked")).toHaveCount(0);
  await expect(page.getByTestId("editor")).not.toHaveAttribute("inert", "");

  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice).toHaveCount(0);

  // A second Save does not bring the notice back.
  await page.getByTestId("editor").locator(".cm-content").click();
  await page.keyboard.type(" Again.");
  await page.getByRole("button", { name: "Save" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Commit" })
    .click();
  await expect(page.getByTestId("status")).toHaveText("Saved");
  await expect(page.getByTestId("lock-notice")).toHaveCount(0);
});

test("a conflict never starts the lock", async ({ page }) => {
  await control("build-sha", { sha: UNKNOWN_BUILD });
  await openEditor(page);
  await control("external-write", {
    path: "Alpha Note.md",
    content: "# Alpha Note\n\nTheirs.\n",
    author: { name: "Bob", login: "bob" },
  });

  await saveEdit(page);

  await expect(page.locator("[data-save-flow-banner]")).toBeVisible();
  await expect(page.getByTestId("lock-locked")).toHaveCount(0);
  await expect(page.getByTestId("editor")).not.toHaveAttribute("inert", "");
});
