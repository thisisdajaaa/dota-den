import { describe, expect, it } from "vitest";
import { ValveHeroKit } from "@/modules/guides/infrastructure/valve-hero-kit";

/** Trimmed from www.dota2.com/datafeed/herodata?hero_id=100 (patch 7.42, Nov 2026). */
const TUSK = {
  result: {
    data: {
      heroes: [
        {
          id: 100,
          name: "npc_dota_hero_tusk",
          abilities: [
            { id: 5565, name: "tusk_ice_shards", name_loc: "Ice Shards", ability_is_innate: false },
            { id: 5566, name: "tusk_snowball", name_loc: "Snowball", ability_is_innate: false },
            {
              id: 1386,
              name: "tusk_bitter_chill",
              name_loc: "Bitter Chill",
              ability_is_innate: true,
            },
          ],
          talents: [
            {
              id: 6961,
              name: "special_bonus_unique_tusk_3",
              name_loc: "+{s:bonus_debuff_duration}s Tag Team Duration",
            },
            {
              id: 6962,
              name: "special_bonus_unique_tusk_7",
              name_loc: "+{s:bonus_air_time}s Walrus Punch Stun Duration",
            },
            { id: 414, name: "special_bonus_hp_325", name_loc: "+{s:value} Health" },
            {
              id: 6963,
              name: "special_bonus_unique_tusk_2",
              name_loc: "+{s:bonus_snowball_damage} Snowball Damage",
            },
          ],
        },
      ],
    },
  },
};

function gateway(body: unknown, ok = true) {
  const urls: string[] = [];
  return { urls, getJson: async (url: string) => (urls.push(url), ok ? { ok, body } : { ok }) };
}

describe("ValveHeroKit", () => {
  it("reads the hero's current abilities (no innate) and talents by row", async () => {
    const gw = gateway(TUSK);
    const kit = await new ValveHeroKit(gw as never, {
      baseUrl: "https://feed.test/datafeed",
    }).forHero(100);
    expect(gw.urls[0]).toBe("https://feed.test/datafeed/herodata?language=english&hero_id=100");
    expect(kit?.abilities).toEqual([
      {
        id: 5565,
        name: "Ice Shards",
        imageUrl:
          "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/tusk_ice_shards.png",
      },
      {
        id: 5566,
        name: "Snowball",
        imageUrl:
          "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/tusk_snowball.png",
      },
    ]);
    expect(kit?.talents.map((t) => [t.id, t.tier])).toEqual([
      [6961, 1],
      [6962, 1],
      [414, 2],
      [6963, 2],
    ]);
  });

  it("is null when the feed fails, answers for another hero, or changes shape", async () => {
    expect(await new ValveHeroKit(gateway(TUSK, false) as never).forHero(100)).toBeNull();
    expect(await new ValveHeroKit(gateway(TUSK) as never).forHero(101)).toBeNull();
    expect(await new ValveHeroKit(gateway({ result: {} }) as never).forHero(100)).toBeNull();
    expect(await new ValveHeroKit(gateway(TUSK) as never).forHero(0)).toBeNull();
  });
});
