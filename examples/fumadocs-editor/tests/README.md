# Tests

- `pnpm test` runs Vitest (unit, `src/**/*.test.ts`) and then Playwright (`e2e/`).
- Browser tests run against a **production build of the fixture Vault** in
  `tests/fixtures/vault`, not `public/vault`. `playwright.config.ts` starts it with
  `VAULT_DIR=tests/fixtures/vault pnpm build && pnpm start -p 3101`; `VAULT_DIR`
  is read in `src/lib/vault-dir.ts`. Note that this overwrites `.next`.
- First run needs browsers: `pnpm exec playwright install chromium`.
- The `production` Playwright project runs a build with `GITHUB_REPO`, `GITHUB_BRANCH`
  and `VAULT_PATH` set (View on GitHub present, Edit hidden). The `development`
  project runs `next dev` on port 3102 with `DIST_DIR=.next-dev` (Edit available,
  View on GitHub hidden).
