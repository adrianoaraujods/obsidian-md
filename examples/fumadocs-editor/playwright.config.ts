import { defineConfig } from "@playwright/test";

const PROD_PORT = 3101;
const DEV_PORT = 3102;

// Browser tests run against the *fixture* Vault, never public/vault. VAULT_DIR
// points the build at it (see src/lib/vault-dir.ts).
//
// - "production" is a production build, where Edit is hidden. It is built with
//   the GitHub variables set so View on GitHub is present.
// - "development" is `next dev` in its own distDir, where Edit is available.
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
      testMatch: "development.spec.ts",
      use: { baseURL: `http://localhost:${DEV_PORT}` },
    },
  ],
  webServer: [
    {
      command: `VAULT_DIR=tests/fixtures/vault GITHUB_REPO=acme/wiki GITHUB_BRANCH=main VAULT_PATH=tests/fixtures/vault pnpm build && pnpm start -p ${PROD_PORT}`,
      url: `http://localhost:${PROD_PORT}`,
      timeout: 300_000,
      reuseExistingServer: false,
    },
    {
      command: `VAULT_DIR=tests/fixtures/vault DIST_DIR=.next-dev pnpm dev -p ${DEV_PORT}`,
      url: `http://localhost:${DEV_PORT}`,
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
});
