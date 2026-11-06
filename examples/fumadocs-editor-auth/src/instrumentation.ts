/**
 * A deployed Wiki must never write to disk by mistake, so the production
 * server refuses to start without GITHUB_REPO. (`next build` is exempt.)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
