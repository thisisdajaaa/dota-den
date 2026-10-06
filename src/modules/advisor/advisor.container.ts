import "server-only";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { getMetaService } from "@/modules/meta/composition";
import { AdvisorService } from "./advisor.service";
import { OpenDotaAdvisorSource } from "./infrastructure/opendota-advisor-source";

const source = new OpenDotaAdvisorSource(openDotaGateway(), openDotaConfig());

export const advisorService = new AdvisorService({
  poolRows: (id, days) => source.poolRows(id, days),
  matchups: (heroId) => source.matchups(heroId),
  role: async (id) => {
    const res = await (await getMetaService()).userRole(id);
    return res.ok ? res.value.derivation.position : null;
  },
  candidates: async (position) => {
    const res = await (await getMetaService()).topHeroes(position);
    if (!res.ok) return null;
    return res.value.heroes.map((h) => ({
      heroId: h.heroId,
      highRank: h.highRank ? { rate: h.highRank.adjusted, games: h.highRank.games } : null,
      contestRate: h.pro?.contestRate ?? null,
    }));
  },
});
