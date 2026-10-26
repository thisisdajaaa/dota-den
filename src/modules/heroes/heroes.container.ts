import "server-only";
import { logger } from "@/common/logging/logger";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { stratzHeroCurves } from "@/common/providers/stratz";
import { ok } from "@/common/result";
import { lazy } from "@/common/utils/lazy";
import { matchExtrasService, matchQueries, matchesService } from "@/modules/matches";
import { metaSource } from "@/modules/meta";
import { plusService } from "@/modules/plus";
import type { ItemCatalog } from "./heroes.ports";
import { CompareService } from "./compare.service";
import { HeroesService } from "./heroes.service";
import { OpenDotaHeroSource } from "./infrastructure/opendota-hero-source";
import { usageService } from "@/modules/usage";

/** Hero pages: your imported games plus OpenDota's per-player hero data, wired together. */
export const heroesService = lazy(() => {
  return new HeroesService({
    own: {
      // The whole history (the dashboard's query stops at the newest 5,000 games).
      games: async (accountId32, heroId) =>
        (await matchQueries.heroFacts(accountId32, heroId)).map((f) => ({
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
    lineups: {
      games: (accountId32, filter, now) =>
        matchQueries.lineupFacts(
          accountId32,
          { range: filter.range, mode: filter.mode, heroId: filter.hero },
          now,
        ),
      coverage: (accountId32) => matchQueries.lineupCoverage(accountId32),
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
    extras: { forHero: (accountId32, heroId) => matchExtrasService.forHero(accountId32, heroId) },
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

/** How you compare: your heroes against everyone's recent public games on them. */
export const compareService = lazy(() => {
  const source = new OpenDotaHeroSource(openDotaGateway(), openDotaConfig());
  return new CompareService({
    games: async (accountId32, days) => {
      const res = await source.recentStats(accountId32, days);
      return res.ok ? res.value : null;
    },
    importedGames: async (accountId32, days) => {
      const since = Date.now() - days * 86_400_000;
      return (await matchQueries.heroFacts(accountId32))
        .filter((f) => f.startedAt.getTime() >= since)
        .map((f) => ({
          heroId: f.heroId,
          durationSec: f.durationSec,
          lastHits: null,
          kills: f.kills,
          assists: f.assists,
          deaths: f.deaths,
        }));
    },
    rankTier: async (accountId32) =>
      (await matchesService.playerProfile(accountId32))?.rankTier ?? null,
    curves: async (heroIds, bracket) =>
      (await stratzHeroCurves()?.forHeroes(heroIds, bracket)) ?? null,
    isPlus: (userId) => plusService.isPlus(userId),
    used: (userId) => usageService.record("compare", userId),
  });
});
