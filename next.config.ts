import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets E2E runs use a separate build directory from a developer's `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  images: {
    // Hotlinked from Valve/Steam CDNs, not rehosted (spec §10 legal note).
    remotePatterns: [
      { protocol: "https", hostname: "cdn.cloudflare.steamstatic.com", pathname: "/apps/dota2/**" },
      { protocol: "https", hostname: "avatars.steamstatic.com" },
    ],
  },
};

export default nextConfig;
