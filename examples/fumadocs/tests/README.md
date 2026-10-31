# Tests

- `pnpm test` runs Vitest (unit, `src/**/*.test.ts`) and then Playwright (`e2e/`).
- Browser tests run against a **production build of the fixture Vault** in
  `tests/fixtures/vault`, not `public/vault`. `playwright.config.ts` starts it with
  `VAULT_DIR=tests/fixtures/vault pnpm build && pnpm start -p 3100`; `VAULT_DIR`
  is read in `src/lib/vault-dir.ts`. Note that this overwrites `.next`.
- First run needs browsers: `pnpm exec playwright install chromium`.
