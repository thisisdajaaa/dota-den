import { describe, expect, it } from "vitest";
import { OpenDotaGuideSource } from "@/modules/guides/infrastructure/opendota-guide-source";

/** A gateway that answers from a table keyed by path (query strings ignored). */
function gateway(bodies: Record<string, unknown>) {
  return {
    getJson: async (url: string) => {
      const path = new URL(url).pathname.replace(/^\/api/, "");
      return path in bodies ? { ok: true, body: bodies[path] } : { ok: false };
    },
  };
}

const constants = {
  "/constants/heroes": { "1": { id: 1, name: "npc_dota_hero_monkey_king" } },
  "/constants/hero_abilities": {
    npc_dota_hero_monkey_king: {
      // The real file nests an array here for this hero.
      abilities: ["monkey_king_boundless_strike", ["monkey_king_primal_spring"], "generic_hidden"],
      talents: [{ name: "special_bonus_hp_200", level: 1 }, { bad: true }],
    },
  },
  "/constants/ability_ids": {
    "5716": "monkey_king_boundless_strike",
    "999": "special_bonus_hp_200",
  },
  "/constants/abilities": {
    monkey_king_boundless_strike: {
      dname: "Boundless Strike",
      img: "/apps/dota2/images/dota_react/abilities/monkey_king_boundless_strike.png",
    },
    special_bonus_hp_200: { dname: "+200 Health" },
  },
};

describe("OpenDotaGuideSource.skillBuilds", () => {
  it("reads skill orders and tolerates odd entries in the hero ability list", async () => {
    const source = new OpenDotaGuideSource(
      gateway({
        ...constants,
        "/explorer": {
          rows: [{ ability_upgrades_arr: [5716, 999] }, { ability_upgrades_arr: null }],
        },
      }) as never,
      { baseUrl: "https://api.opendota.com/api" },
    );
    const res = await source.skillBuilds(1);
    expect(res?.builds).toEqual([[5716, 999]]);
    expect(res?.abilities).toEqual([
      {
        id: 5716,
        name: "Boundless Strike",
        imageUrl:
          "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/monkey_king_boundless_strike.png",
      },
    ]);
    expect(res?.talents).toEqual([{ id: 999, name: "+200 Health", tier: 1 }]);
  });
});

describe("OpenDotaGuideSource.wardCells", () => {
  it("turns the grid counts into sides and phases", async () => {
    const source = new OpenDotaGuideSource(
      gateway({
        "/explorer": {
          rows: [
            { kind: "obs", radiant: true, phase: 0, cx: 176, cy: 72, n: "40", games: "300" },
            { kind: "sen", radiant: false, phase: 2, cx: 80, cy: 184, n: 7, games: 300 },
          ],
        },
      }) as never,
      { baseUrl: "https://api.opendota.com/api" },
    );
    expect(await source.wardCells()).toEqual({
      games: 300,
      cells: [
        { kind: "observer", side: "radiant", phase: "early", x: 176, y: 72, count: 40 },
        { kind: "sentry", side: "dire", phase: "late", x: 80, y: 184, count: 7 },
      ],
    });
  });
});
