import type { MetadataRoute } from "next";

/**
 * Crawlers may read the public guides, meta, patches, draft and live pages. Player and match
 * pages are left out: each visit costs OpenDota calls, and crawlers walking every id used up
 * the daily budget that signed-in players' syncs need. Preview images (/og, /img) and share
 * links stay open: chat apps that honour robots.txt still need them for link previews.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "https://dota-den.vercel.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/meta", "/guides", "/patches", "/draft", "/live"],
        disallow: [
          "/players/",
          "/matches/",
          "/api/",
          "/groups/",
          "/email/",
          "/dashboard",
          "/heroes",
          "/admin",
        ],
      },
    ],
    host: base,
    sitemap: `${base.replace(/\/+$/, "")}/sitemap.xml`,
  };
}
