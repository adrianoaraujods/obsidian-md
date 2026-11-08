import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

// The Manager moves Notes in this folder of the fixture Vault; each test puts
// them back. The project runs after the others (see playwright.config.ts)
// because moving a Note rebuilds the pages the development server serves.
const vault = path.resolve("tests/fixtures/vault");
const F = "Manager Fixture";

function snapshot(dir = vault, prefix = ""): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [p, c] of snapshot(path.join(dir, entry.name), rel))
        files.set(p, c);
    } else files.set(rel, fs.readFileSync(path.join(dir, entry.name), "utf8"));
  }
  return files;
}

let original = new Map<string, string>();
test.describe.configure({ mode: "serial" });
test.beforeEach(() => {
  original = snapshot();
});
test.afterEach(() => {
  // Undo only what the test changed, so the dev server rebuilds as little as possible.
  for (const rel of snapshot().keys()) {
    if (!original.has(rel)) {
      fs.rmSync(path.join(vault, rel));
      let dir = path.dirname(path.join(vault, rel));
      while (dir !== vault && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      }
    }
  }
  for (const [rel, content] of original) {
    const full = path.join(vault, rel);
    if (!fs.existsSync(full) || fs.readFileSync(full, "utf8") !== content) {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }
});

/** The page shows the built Vault, which catches up with the files a moment after a restore. */
async function openManager(page: Page) {
  await expect(async () => {
    await page.goto("/manage");
    await expect(row(page, `${F}/Rename Me.md`)).toBeVisible({ timeout: 2000 });
    await expect(row(page, `${F}/Pick Me.md`)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}

const P = (name: string) => `${F}/${name}`;
const row = (page: Page, notePath: string) =>
  page.locator(`[data-path="${notePath}"]`);
const onDisk = (rel: string) => fs.existsSync(path.join(vault, rel));
const toast = (page: Page) => page.locator("[data-sonner-toast]");

async function rename(page: Page, notePath: string, to: string) {
  await page.getByRole("button", { name: `Rename ${notePath}` }).click();
  const input = page.getByRole("textbox", {
    name: `New name for ${notePath}`,
  });
  await input.fill(to);
  await input.press("Enter");
}

async function apply(page: Page) {
  const dialog = page.getByRole("dialog");
  // dnd-kit swallows the first click right after a drop, so retry it.
  await expect(async () => {
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(dialog.getByTestId("commit-subject")).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  await dialog.getByRole("button", { name: "Commit" }).click();
}

test("renders the deployed Vault as a tree", async ({ page }) => {
  await openManager(page);
  await expect(row(page, P("Docs/Guide.md"))).toBeVisible();
  await expect(page.getByText("No pending changes")).toBeVisible();
});

test("dragging a Note onto a folder stages a move and Apply commits it", async ({
  page,
}) => {
  await openManager(page);
  const handle = page.getByRole("button", { name: `Drag ${P("Pick Me.md")}` });
  const target = page.locator(`[data-folder="${P("Docs")}"]`);
  await target.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const box = async (l: typeof handle) => {
    const b = await l.boundingBox();
    if (!b) throw new Error("not visible");
    return b;
  };
  const from = await box(handle);
  const to = await box(target);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByTestId("pending")).toContainText(
    `Move ${P("Pick Me.md")} → ${P("Docs/Pick Me.md")}`,
  );
  expect(onDisk(P("Pick Me.md"))).toBe(true);

  await apply(page);

  await expect(toast(page)).toContainText("Committed");
  await expect(row(page, P("Docs/Pick Me.md"))).toBeVisible();
  expect(onDisk(P("Docs/Pick Me.md"))).toBe(true);
  expect(onDisk(P("Pick Me.md"))).toBe(false);
});

test("Move to… moves a Note with the keyboard only", async ({ page }) => {
  await openManager(page);
  await page
    .getByRole("button", { name: `Move to… ${P("Drag Me.md")}` })
    .focus();
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", {
    name: `Folder for ${P("Drag Me.md")}`,
  });
  await expect(input).toBeFocused();
  await page.keyboard.type(P("Archive"));
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("pending")).toContainText(
    `Move ${P("Drag Me.md")} → ${P("Archive/Drag Me.md")}`,
  );
  await page.getByRole("button", { name: "Apply" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Commit" }).focus();
  await page.keyboard.press("Enter");

  await expect(toast(page)).toContainText("Committed");
  await expect(row(page, P("Archive/Drag Me.md"))).toBeVisible();
  expect(onDisk(P("Archive/Drag Me.md"))).toBe(true);
  expect(onDisk(P("Drag Me.md"))).toBe(false);
});

test("renaming a Note stages a Rename and commits it", async ({ page }) => {
  await openManager(page);
  await rename(page, P("Rename Me.md"), "Renamed");

  await expect(page.getByTestId("pending")).toContainText(
    `Rename ${P("Rename Me.md")} → ${P("Renamed.md")}`,
  );
  await apply(page);

  await expect(toast(page)).toContainText("Committed");
  await expect(row(page, P("Renamed.md"))).toBeVisible();
  expect(onDisk(P("Renamed.md"))).toBe(true);
  expect(onDisk(P("Rename Me.md"))).toBe(false);
});

test("the confirm dialog shows the commit subject, body and trailer", async ({
  page,
}) => {
  await openManager(page);
  await rename(page, P("Rename Me.md"), "Renamed");
  await page.getByRole("button", { name: "Apply" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("commit-subject")).toHaveValue(
    `Rename ${P("Rename Me.md")}`,
  );
  await expect(dialog.getByTestId("commit-body")).toHaveValue(
    `- Rename ${P("Rename Me.md")} → ${P("Renamed.md")}`,
  );
  await expect(dialog.getByTestId("commit-trailer")).toHaveValue(
    /Edited-with: obsidian-md editor/,
  );
  await expect(dialog).toContainText("will not redirect");
  expect(onDisk(P("Rename Me.md"))).toBe(true);
});

test("per-change undo and discard all", async ({ page }) => {
  await openManager(page);
  await rename(page, P("Rename Me.md"), "One");
  await rename(page, P("Pick Me.md"), "Two");
  const pending = page.getByTestId("pending");
  await expect(pending).toContainText(`${P("Rename Me.md")} → ${P("One.md")}`);
  await expect(pending).toContainText(`${P("Pick Me.md")} → ${P("Two.md")}`);

  await page
    .getByRole("button", { name: `Undo Rename ${P("Rename Me.md")}` })
    .click();
  await expect(pending).not.toContainText("One.md");
  await expect(pending).toContainText("Two.md");

  await page.getByRole("button", { name: "Discard all" }).click();
  await expect(page.getByText("No pending changes")).toBeVisible();
  await expect(row(page, P("Pick Me.md"))).toBeVisible();
});

test("refuses a name that is taken, or that clashes in case, and stages nothing", async ({
  page,
}) => {
  await openManager(page);
  await rename(page, P("Rename Me.md"), "Pick Me");
  await expect(page.getByTestId("error")).toContainText("already exists");

  const input = page.getByRole("textbox", {
    name: `New name for ${P("Rename Me.md")}`,
  });
  await input.fill("pick me");
  await input.press("Enter");
  await expect(page.getByTestId("error")).toContainText("only in case");

  await input.fill("../Escape");
  await input.press("Enter");
  await expect(page.getByTestId("error")).toContainText('".."');
  await expect(page.getByText("No pending changes")).toBeVisible();
});
