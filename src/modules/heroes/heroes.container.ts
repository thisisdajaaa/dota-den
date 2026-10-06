import "server-only";
import { logger } from "@/common/logging/logger";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { ok } from "@/common/result";
import { lazy } from "@/common/utils/lazy";
import { matchQueries, matchesService } from "@/modules/matches";
import { metaSource } from "@/modules/meta";
import type { ItemCatalog } from "./heroes.ports";
import { HeroesService } from "./heroes.service";
import { OpenDotaHeroSource } from "./infrastructure/opendota-hero-source";

/** Hero pages: your imported games plus OpenDota's per-player hero data, wired together. */
export const heroesService = lazy(() => {
  return new HeroesService({
    own: {
      games: async (accountId32) =>
        (
          await matchQueries.dashboardFacts(accountId32, { range: "all", mode: "all" }, new Date())
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
    player: new OpenDotaHeroSource(openDotaGateway(), openDotaConfig()),
    highRank: {
      heroStats: async () => {
        const res = await metaSource.heroStats();
        return res.ok ? ok(res.value.value) : res;
      },
    },
    lanes: {
      recentLanes: async (accountId32) => {
        const res = await metaSource.recentLanes(accountId32);
        return res.ok ? ok(res.value.value) : res;
      },
    },
    heroes: async () =>
      [...(await matchesService.heroMap()).values()].map((h) => ({ id: h.id, roles: h.roles })),
    items: async (): Promise<ItemCatalog> => {
      try {
        const items = await matchesService.itemMap();
        return new Map([...items.values()].map((i) => [i.key, i]));
      } catch (e) {
        logger.warn("hero_items_catalog_failed", { error: e });
        return new Map();
      }
    },
  });
});
