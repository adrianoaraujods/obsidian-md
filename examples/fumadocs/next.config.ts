import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
};

const withMDX = createMDX({
  configPath: "source.config.ts",
});

export default withMDX(nextConfig);
