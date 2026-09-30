import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  getHeroMap,
  getItemMap,
  getMatchQueries,
  openDotaGateway,
} from "@/modules/matches/composition";
import { getHighRankHeroStats, getPlayerLaneHistory } from "@/modules/meta/composition";
import { getViewerTimeZone } from "@/modules/mmr/composition";
import { ok } from "@/modules/shared/domain/result";
import { HeroesService } from "./application/heroes-service";
import type { ItemCatalog } from "./application/ports";
import { OpenDotaHeroSource } from "./infrastructure/opendota-hero-source";

/** Hero pages: your imported games plus OpenDota's per-player hero data, wired together. */
export async function getHeroesService(): Promise<HeroesService> {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  const [queries, heroMap, tz] = await Promise.all([
    getMatchQueries(),
    getHeroMap(),
    getViewerTimeZone(),
  ]);
  const highRankStats = getHighRankHeroStats();
  return new HeroesService({
    own: {
      games: async (accountId32) =>
        (
          await queries.dashboardFacts(accountId32, { range: "all", mode: "all" }, new Date())
        ).facts.map((f) => ({
          matchId: f.matchId,
          heroId: f.heroId,
          startedAt: f.startedAt,
          result: f.result,
          kills: f.kills,
          deaths: f.deaths,
          assists: f.assists,
          patch: f.patch,
        })),
    },
    player: new OpenDotaHeroSource(openDotaGateway(), {
      apiKey: OPENDOTA_API_KEY,
      baseUrl: OPENDOTA_BASE_URL,
    }),
    highRank: {
      heroStats: async () => {
        const res = await highRankStats();
        return res.ok ? ok(res.value.value) : res;
      },
    },
    lanes: {
      recentLanes: async (accountId32) => {
        const res = await getPlayerLaneHistory().recentLanes(accountId32);
        return res.ok ? ok(res.value.value) : res;
      },
    },
    heroes: [...heroMap.values()].map((h) => ({ id: h.id, roles: h.roles })),
    items: async (): Promise<ItemCatalog> => {
      try {
        const items = await getItemMap();
        return new Map([...items.values()].map((i) => [i.key, i]));
      } catch (e) {
        logger.warn("hero_items_catalog_failed", { error: e });
        return new Map();
      }
    },
    timeZone: tz.timeZone,
  });
}
