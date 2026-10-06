import "server-only";
import { env } from "@/common/config/env";
import { openDotaGateway } from "@/modules/matches/composition";
import { GuideService } from "./application/guide-service";
import { topItems } from "./domain/hero-guide";
import { OpenDotaGuideSource } from "./infrastructure/opendota-guide-source";

export function getGuideService(): GuideService {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  return new GuideService({
    source: new OpenDotaGuideSource(openDotaGateway(), {
      baseUrl: OPENDOTA_BASE_URL ?? "https://api.opendota.com/api",
      apiKey: OPENDOTA_API_KEY,
    }),
  });
}

/**
 * The items pros buy most on a hero in the mid and late game (consumables left out), as
 * ranks: OpenDota gives purchase counts without the number of games, so no percentages.
 */
export async function getProCoreItems(
  heroId: number,
  isConsumable: (itemId: number) => boolean,
): Promise<Array<{ phase: "mid" | "late"; itemId: number; rank: number }> | null> {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  const source = new OpenDotaGuideSource(openDotaGateway(), {
    baseUrl: OPENDOTA_BASE_URL ?? "https://api.opendota.com/api",
    apiKey: OPENDOTA_API_KEY,
  });
  const pop = await source.itemPopularity(heroId).catch(() => null);
  if (!pop) return null;
  return (["mid", "late"] as const).flatMap((phase) =>
    topItems(pop[phase] ?? {}, isConsumable, 4).map((it, i) => ({
      phase,
      itemId: it.itemId,
      rank: i + 1,
    })),
  );
}
