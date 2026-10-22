import type { MetadataRoute } from "next";
import { logger } from "@/common/logging/logger";
import { buildSitemap } from "@/common/utils/sitemap";
import { matchesService } from "@/modules/matches";
import { patchesService } from "@/modules/patches";

// Built per request, not at build time: the build has no stored patches (and shouldn't call
// OpenDota). Crawlers fetch it a few times a day; each build is a few small cached reads.
export const dynamic = "force-dynamic";

/** Most patches a sitemap lists (newest first), in pages of the API's largest size. */
const MAX_PATCH_PAGES = 6;
/** A slow source mustn't hold the sitemap up: past this it's left out. */
const SOURCE_TIMEOUT_MS = 5_000;

async function settle<T>(source: string, work: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), SOURCE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    logger.warn("sitemap_source_failed", { source, error });
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/** Stored patches only (no import from Valve here). */
async function storedPatches(): Promise<Array<{ version: string; publishedAt: Date }>> {
  const all: Array<{ version: string; publishedAt: Date }> = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PATCH_PAGES; page++) {
    const res = await patchesService.list({ cursor, limit: 50 });
    all.push(...res.items.map(({ version, publishedAt }) => ({ version, publishedAt })));
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return all;
}

/**
 * /sitemap.xml: the public pages, a guide per hero (the cached hero catalog: one lookup, no
 * per-hero calls) and every stored patch. A source that fails is left out, not an error.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [heroIds, patches] = await Promise.all([
    settle("heroes", async () => [...(await matchesService.heroMap()).keys()], [] as number[]),
    settle("patches", storedPatches, []),
  ]);
  return buildSitemap({
    baseUrl: process.env.APP_URL ?? "https://dota-den.vercel.app",
    heroIds,
    patches,
  });
}
