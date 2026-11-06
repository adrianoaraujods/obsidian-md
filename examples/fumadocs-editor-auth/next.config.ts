import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The browser tests run `next dev` beside a production build; a separate
  // distDir keeps the two from overwriting each other.
  distDir: process.env.DIST_DIR ?? ".next",
};

const withMDX = createMDX({
  configPath: "source.config.ts",
});

export default withMDX(nextConfig);
