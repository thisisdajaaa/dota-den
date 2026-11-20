import { z } from "zod";
import type { ProviderGateway } from "@/common/providers/provider-gateway";
import type { AbilityRef, HeroKit, TalentRef } from "../domain/skill-build";

const HOUR = 60 * 60 * 1000;
const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com";
export const VALVE_DATAFEED_URL = "https://www.dota2.com/datafeed";

const HeroDataSchema = z.object({
  result: z.object({
    data: z.object({
      heroes: z
        .array(
          z
            .object({
              id: z.number().int(),
              abilities: z
                .array(
                  z
                    .object({
                      id: z.number().int(),
                      name: z.string(),
                      name_loc: z.string(),
                      ability_is_innate: z.boolean().optional(),
                    })
                    .passthrough(),
                )
                .default([]),
              talents: z
                .array(
                  z
                    .object({ id: z.number().int(), name: z.string(), name_loc: z.string() })
                    .passthrough(),
                )
                .default([]),
            })
            .passthrough(),
        )
        .min(1),
    }),
  }),
});

/**
 * A hero's current abilities and talents from Valve's own hero data (the feed behind
 * dota2.com/hero pages), which follows each patch on the day it ships. Talents come in rows of
 * two, level 10 first. Innate abilities are left out: they never take a skill point.
 */
export class ValveHeroKit {
  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { baseUrl?: string } = {},
  ) {}

  async forHero(heroId: number): Promise<HeroKit | null> {
    if (!Number.isSafeInteger(heroId) || heroId < 1) return null;
    const u = new URL(`${this.opts.baseUrl ?? VALVE_DATAFEED_URL}/herodata`);
    u.searchParams.set("language", "english");
    u.searchParams.set("hero_id", String(heroId));
    const res = await this.gateway.getJson(u.toString(), { cacheTtlMs: 6 * HOUR });
    if (!res.ok) return null;
    const parsed = HeroDataSchema.safeParse(res.body);
    if (!parsed.success) return null;
    const hero = parsed.data.result.data.heroes[0];
    if (hero.id !== heroId) return null;
    const abilities = hero.abilities
      .filter((a) => !a.ability_is_innate && a.name_loc.trim() !== "")
      .map((a): AbilityRef => ({
        id: a.id,
        name: a.name_loc,
        imageUrl: `${STEAM_CDN}/apps/dota2/images/dota_react/abilities/${a.name}.png`,
      }));
    const talents = hero.talents
      .slice(0, 8)
      .flatMap((t, i): TalentRef[] =>
        t.name_loc.trim() === ""
          ? []
          : [{ id: t.id, name: t.name_loc, tier: (Math.floor(i / 2) + 1) as TalentRef["tier"] }],
      );
    return { abilities, talents };
  }
}
