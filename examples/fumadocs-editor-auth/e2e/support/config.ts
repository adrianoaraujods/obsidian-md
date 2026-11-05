// Ports are distinct from the other Examples (fumadocs, fumadocs-editor use
// 3100-3102) so the e2e jobs and local runs can overlap.
export const PROD_PORT = 3103;
export const DEV_PORT = 3104;
export const FAKE_GITHUB_PORT = 3105;
/** The startup checks spawn their own `next start` here. */
export const STARTUP_PORT = 3106;

/** The test `BETTER_AUTH_SECRET`; session cookies are minted from it. */
export const TEST_SECRET = "playwright-secret-playwright-secret-0123";

export const FAKE_GITHUB_URL = `http://localhost:${FAKE_GITHUB_PORT}`;
