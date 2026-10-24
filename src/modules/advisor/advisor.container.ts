import "server-only";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { stratzHeroMatchups } from "@/common/providers/stratz";
import { metaService } from "@/modules/meta";
import { lazy } from "@/common/utils/lazy";
import { AdvisorService } from "./advisor.service";
import { OpenDotaAdvisorSource } from "./infrastructure/opendota-advisor-source";

export const advisorService = lazy(() => {
  const source = new OpenDotaAdvisorSource(openDotaGateway(), openDotaConfig());
  const stratz = stratzHeroMatchups();
  return new AdvisorService({
    poolRows: (id, days) => source.poolRows(id, days),
    // The latest full week of Legend–Immortal pubs from STRATZ; OpenDota's pro-only tables when it can't answer.
    matchups: async (heroId) =>
      (await stratz?.forHero(heroId).catch(() => null))?.vs ?? source.matchups(heroId),
    role: async (id) => {
      const res = await metaService.userRole(id);
      return res.ok ? res.value.derivation.position : null;
    },
    candidates: async (position) => {
      const res = await metaService.topHeroes(position);
      if (!res.ok) return null;
      return res.value.heroes.map((h) => ({
        heroId: h.heroId,
        highRank: h.highRank ? { rate: h.highRank.adjusted, games: h.highRank.games } : null,
        contestRate: h.pro?.contestRate ?? null,
      }));
    },
  });
});
