import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets E2E runs use a separate build directory from a developer's `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  experimental: {
    // E2E runs compile from scratch: with the dev cache kept between runs, next dev 16.4
    // reloads every page over and over ("HMR hash mismatch") once sources have changed.
    turbopackFileSystemCacheForDev: process.env.NEXT_DIST_DIR !== ".next-e2e",
  },
  // Keep the dev-mode badge away from the sidebar's account chip.
  devIndicators: { position: "bottom-right" },
  images: {
    // Served straight from Valve's and Steam's CDNs, which already send small, cached
    // images. Vercel's optimizer added nothing but a monthly quota: when it ran out, every
    // image failed with 402 (issue #1).
    unoptimized: true,
    // Hotlinked from Valve/Steam CDNs, not rehosted (spec §10 legal note).
    remotePatterns: [
      { protocol: "https", hostname: "cdn.cloudflare.steamstatic.com", pathname: "/apps/dota2/**" },
      { protocol: "https", hostname: "avatars.steamstatic.com" },
      // Valve's rank medal artwork as served by OpenDota (next/image caches optimized copies).
      {
        protocol: "https",
        hostname: "www.opendota.com",
        pathname: "/assets/images/dota2/rank_icons/**",
      },
    ],
  },
};

export default nextConfig;
