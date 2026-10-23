/** One sitemap entry (the subset of Next's MetadataRoute.Sitemap item we use). */
export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: "hourly" | "daily" | "weekly" | "monthly";
  priority?: number;
}

/** Public pages crawlers may index (robots.ts lets them in). */
const PAGES: ReadonlyArray<Omit<SitemapEntry, "url"> & { path: string }> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/meta", changeFrequency: "daily", priority: 0.9 },
  { path: "/guides", changeFrequency: "weekly", priority: 0.8 },
  { path: "/patches", changeFrequency: "weekly", priority: 0.8 },
  { path: "/draft", changeFrequency: "monthly", priority: 0.7 },
  { path: "/draft/challenges", changeFrequency: "daily", priority: 0.6 },
  { path: "/live", changeFrequency: "hourly", priority: 0.6 },
  { path: "/players", changeFrequency: "monthly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.2 },
  { path: "/refunds", changeFrequency: "monthly", priority: 0.2 },
];

/**
 * The sitemap from data already at hand: the public pages, a guide per hero and a page per
 * stored patch. Missing data (an empty hero list or no patches) just leaves those out.
 */
export function buildSitemap(input: {
  baseUrl: string;
  heroIds: readonly number[];
  patches: ReadonlyArray<{ version: string; publishedAt: Date }>;
}): SitemapEntry[] {
  const base = input.baseUrl.replace(/\/+$/, "");
  const at = (path: string) => (path === "/" ? `${base}/` : `${base}${path}`);
  const latest = input.patches.reduce<Date | undefined>(
    (max, p) => (!max || p.publishedAt > max ? p.publishedAt : max),
    undefined,
  );
  return [
    ...PAGES.map(({ path, ...rest }) => ({
      url: at(path),
      ...rest,
      ...(path === "/patches" && latest ? { lastModified: latest } : {}),
    })),
    ...[...new Set(input.heroIds)]
      .sort((a, b) => a - b)
      .map((id) => ({
        url: at(`/guides/${id}`),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ...input.patches.map((p) => ({
      url: at(`/patches/${encodeURIComponent(p.version)}`),
      lastModified: p.publishedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
