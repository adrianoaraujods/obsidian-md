# Tests

- `pnpm test` runs Vitest (unit, `src/**/*.test.ts`) and then Playwright (`e2e/`).
- Browser tests run against the **fixture Vault** in `tests/fixtures/vault`, not
  `public/vault` (`VAULT_DIR`, read in `src/lib/vault-dir.ts`).
- First run needs browsers: `pnpm exec playwright install chromium`.
- No test touches the real GitHub. `e2e/support/fake-github.mjs` (port 3105) serves
  the OAuth consent page, token exchange and user API; `GITHUB_OAUTH_URL` and
  `GITHUB_API_URL` point the app at it. It is also the repo the editor saves to:
  `/api/repos/...` is the adapter's `createFakeContentsApi`, seeded with the fixture
  Vault's Notes, with `/__test/*` controls (`reset`, `reject-token`,
  `external-write`, `state`) used by `e2e/editor.spec.ts`. It is seeded with every file
  of the fixture Vault (Notes, `meta.json`, Assets), which `e2e/manager.spec.ts` moves
  and reorders through `/manage`, asserting on the repo and its commits.
- Ports: production 3103, development 3104, fake GitHub 3105, startup checks 3106.
  `e2e/support/config.ts` holds them and the test `BETTER_AUTH_SECRET`.
- Most tests start signed in with `signInAs(context, baseURL, login)`
  (`e2e/support/sign-in.ts`), which mints Better Auth's session cookies from the test
  secret (`e2e/support/session-cookie.ts`). One group (`sign-in through the fake
  GitHub`) walks the real flow: Edit, the fake consent page, the return to
  `/edit/<slug>`, cancel, and an account the access hook rejects (`TEST_DENY_LOGINS`).
- `startup.spec.ts` spawns its own `next start` to check that production refuses to
  start without `GITHUB_REPO`, and that a bad environment gives one error listing
  every variable at the first request while the Wiki itself still serves.
- The `production` project builds with only the repo variables, to show the build
  needs no secrets.
