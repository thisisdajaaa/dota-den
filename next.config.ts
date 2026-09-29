import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets E2E runs use a separate build directory from a developer's `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
};

export default nextConfig;
