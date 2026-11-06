import { defineConfig } from "@playwright/test";

import {
  DEV_PORT,
  FAKE_GITHUB_PORT,
  FAKE_GITHUB_URL,
  PROD_PORT,
  TEST_SECRET,
} from "./e2e/support/config";

// Browser tests run against the *fixture* Vault, never public/vault. VAULT_DIR
// points the build at it (see src/lib/vault-dir.ts).
//
// - "production" is a production build. It is built with only the GitHub
//   repo variables (the build needs no secrets) and started with the rest.
// - "development" is `next dev` in its own distDir, with no GITHUB_REPO, so
//   the Vault is the local filesystem.
// - A fake GitHub stands in for OAuth, so no test touches the real one.
const authEnv = (port: number) =>
  [
    `BETTER_AUTH_SECRET=${TEST_SECRET}`,
    `BETTER_AUTH_URL=http://localhost:${port}`,
    "GITHUB_CLIENT_ID=fake-client",
    "GITHUB_CLIENT_SECRET=fake-secret",
    `GITHUB_OAUTH_URL=${FAKE_GITHUB_URL}`,
    `GITHUB_API_URL=${FAKE_GITHUB_URL}/api`,
    "TEST_DENY_LOGINS=blocked-user",
    `TEST_BUILD_SHA_URL=${FAKE_GITHUB_URL}/__test/build-sha`,
    // Fast deploy-lock polling; a real deploy waits a minute, then 5 seconds.
    "EDITOR_LOCK_FIRST_POLL_MS=100",
    "EDITOR_LOCK_INTERVAL_MS=150",
    "EDITOR_LOCK_TIMEOUT_MS=2500",
  ].join(" ");

export default defineConfig({
  testDir: "e2e",
  // The specs that save share one fake GitHub repo, so files run one at a time.
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  projects: [
    {
      name: "production",
      testMatch: [
        "production.spec.ts",
        "editor.spec.ts",
        "file-tree-menu.spec.ts",
        "new-note.spec.ts",
        "lock.spec.ts",
        "startup.spec.ts",
      ],
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
      command: `node e2e/support/fake-github.mjs ${FAKE_GITHUB_PORT}`,
      url: `${FAKE_GITHUB_URL}/health`,
      reuseExistingServer: false,
    },
    {
      command: `VAULT_DIR=tests/fixtures/vault GITHUB_REPO=acme/wiki GITHUB_BRANCH=main VAULT_PATH=tests/fixtures/vault pnpm build && ${authEnv(PROD_PORT)} GITHUB_REPO=acme/wiki GITHUB_BRANCH=main VAULT_PATH=tests/fixtures/vault GITHUB_TOKEN=ghp_fake pnpm start -p ${PROD_PORT}`,
      url: `http://localhost:${PROD_PORT}`,
      timeout: 300_000,
      reuseExistingServer: false,
    },
    {
      command: `VAULT_DIR=tests/fixtures/vault DIST_DIR=.next-dev ${authEnv(DEV_PORT)} pnpm dev -p ${DEV_PORT}`,
      url: `http://localhost:${DEV_PORT}`,
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
});
