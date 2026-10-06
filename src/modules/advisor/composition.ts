import "server-only";
import { env } from "@/common/config/env";
import { openDotaGateway } from "@/modules/matches/composition";
import { getMetaService } from "@/modules/meta/composition";
import { AdvisorService } from "./application/advisor-service";
import { OpenDotaAdvisorSource } from "./infrastructure/opendota-advisor-source";

export async function getAdvisorService(): Promise<AdvisorService> {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  const source = new OpenDotaAdvisorSource(openDotaGateway(), {
    baseUrl: OPENDOTA_BASE_URL ?? "https://api.opendota.com/api",
    apiKey: OPENDOTA_API_KEY,
  });
  const meta = await getMetaService();
  return new AdvisorService({
    poolRows: (id, days) => source.poolRows(id, days),
    matchups: (heroId) => source.matchups(heroId),
    role: async (id) => {
      const res = await meta.userRole(id);
      return res.ok ? res.value.derivation.position : null;
    },
    candidates: async (position) => {
      const res = await meta.topHeroes(position);
      if (!res.ok) return null;
      return res.value.heroes.map((h) => ({
        heroId: h.heroId,
        highRank: h.highRank ? { rate: h.highRank.adjusted, games: h.highRank.games } : null,
        contestRate: h.pro?.contestRate ?? null,
      }));
    },
  });
}
