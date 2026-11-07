import { defineConfig } from "@playwright/test";

const PROD_PORT = Number(process.env.E2E_PROD_PORT ?? 3101);
const DEV_PORT = Number(process.env.E2E_DEV_PORT ?? 3102);

// Browser tests run against the *fixture* Vault, never public/vault. VAULT_DIR
// points the build at it (see src/lib/vault-dir.ts).
//
// - "production" is a production build, where Edit is hidden. It is built with
//   the GitHub variables set so View on GitHub is present.
// - "development" is `next dev` in its own distDir, where Edit is available.
// The servers start with `npm run`, not `pnpm`: pnpm inside an Example re-installs
// it under its own standalone lockfile and swaps the workspace packages for the
// published ones, so the browser tests would run stale package code.
export default defineConfig({
  testDir: "e2e",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  projects: [
    {
      name: "production",
      testMatch: "production.spec.ts",
      use: { baseURL: `http://localhost:${PROD_PORT}` },
    },
    {
      name: "development",
      testMatch: [
        "development.spec.ts",
        "live-preview.spec.ts",
        "multi-cursor.spec.ts",
        "editing-shortcuts.spec.ts",
        "links.spec.ts",
      ],
      use: { baseURL: `http://localhost:${DEV_PORT}` },
    },
  ],
  webServer: [
    {
      command: `VAULT_DIR=tests/fixtures/vault GITHUB_REPO=acme/wiki GITHUB_BRANCH=main VAULT_PATH=tests/fixtures/vault npm run build && npm run start -- -p ${PROD_PORT}`,
      url: `http://localhost:${PROD_PORT}`,
      timeout: 300_000,
      reuseExistingServer: false,
    },
    {
      command: `VAULT_DIR=tests/fixtures/vault DIST_DIR=.next-dev npm run dev -- -p ${DEV_PORT}`,
      url: `http://localhost:${DEV_PORT}`,
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
});
