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
      patch: null,
      currentPatch: null,
      cells: [
        { kind: "observer", side: "radiant", phase: "early", x: 176, y: 72, count: 40 },
        { kind: "sentry", side: "dire", phase: "late", x: 80, y: 184, count: 7 },
      ],
    });
  });
});

describe("OpenDotaGuideSource: current patch first", () => {
  /** Explorer answers by what the SQL asks for; constants by path. */
  function patchGateway(opts: { currentGames: number; skillRows: unknown[] }) {
    const sqls: string[] = [];
    return {
      sqls,
      getJson: async (url: string) => {
        const u = new URL(url);
        const path = u.pathname.replace(/^\/api/, "");
        if (path === "/constants/patch")
          return {
            ok: true,
            body: [
              { name: "7.40", date: "2025-12-16T00:00:00Z" },
              { name: "7.41", date: "2026-03-24T00:00:00Z" },
              { name: "7.42", date: "2026-11-18T21:28:07Z" },
              { name: "7.42'; DROP TABLE x; --", date: "2026-11-19T00:00:00Z" },
            ],
          };
        if (path === "/explorer") {
          const sql = u.searchParams.get("sql") ?? "";
          sqls.push(sql);
          if (sql.includes("ability_upgrades_arr"))
            return { ok: true, body: { rows: opts.skillRows } };
          const games = sql.includes("'7.42'") ? opts.currentGames : 300;
          return {
            ok: true,
            body: {
              rows: [{ kind: "obs", radiant: true, phase: 0, cx: 100, cy: 100, n: 9, games }],
            },
          };
        }
        if (path in constants) return { ok: true, body: constants[path as keyof typeof constants] };
        return { ok: false };
      },
    };
  }

  it("uses the current patch's skill orders once there are enough games", async () => {
    const rows = [
      ...Array.from({ length: 8 }, () => ({ patch: "7.42", ability_upgrades_arr: [5716] })),
      { patch: "7.41", ability_upgrades_arr: [999] },
    ];
    const gw = patchGateway({ currentGames: 0, skillRows: rows });
    const source = new OpenDotaGuideSource(gw as never, {
      baseUrl: "https://api.opendota.com/api",
    });
    const res = await source.skillBuilds(1);
    expect(res).toMatchObject({ patch: "7.42", currentPatch: "7.42" });
    expect(res?.builds).toHaveLength(8);
    expect(gw.sqls[0]).toContain("mp.patch IN ('7.42', '7.41')");
    expect(gw.sqls.join(" ")).not.toContain("DROP TABLE");
  });

  it("falls back to the previous patch's skill orders, and says so", async () => {
    const rows = [
      { patch: "7.42", ability_upgrades_arr: [5716] },
      ...Array.from({ length: 9 }, () => ({ patch: "7.41", ability_upgrades_arr: [999] })),
    ];
    const source = new OpenDotaGuideSource(
      patchGateway({ currentGames: 0, skillRows: rows }) as never,
      {
        baseUrl: "https://api.opendota.com/api",
      },
    );
    const res = await source.skillBuilds(1);
    expect(res).toMatchObject({ patch: "7.41", currentPatch: "7.42" });
    expect(res?.builds).toHaveLength(9);
  });

  it("prefers the hero kit it's given (Valve's current data) over OpenDota's constants", async () => {
    const source = new OpenDotaGuideSource(
      patchGateway({ currentGames: 0, skillRows: [] }) as never,
      {
        baseUrl: "https://api.opendota.com/api",
        heroKit: async () => ({
          abilities: [{ id: 7, name: "New Strike", imageUrl: null }],
          talents: [{ id: 70, name: "+{s:value} New", tier: 1 }],
        }),
      },
    );
    const res = await source.skillBuilds(1);
    expect(res?.abilities.map((a) => a.name)).toEqual(["New Strike"]);
    expect(res?.talents.map((t) => t.id)).toEqual([70]);
  });

  it("maps wards from the current patch once it has enough games", async () => {
    const source = new OpenDotaGuideSource(
      patchGateway({ currentGames: 40, skillRows: [] }) as never,
      {
        baseUrl: "https://api.opendota.com/api",
      },
    );
    expect(await source.wardCells()).toMatchObject({
      games: 40,
      patch: "7.42",
      currentPatch: "7.42",
    });
  });

  it("maps wards from the previous patch while the new one has few games", async () => {
    const gw = patchGateway({ currentGames: 16, skillRows: [] });
    const source = new OpenDotaGuideSource(gw as never, {
      baseUrl: "https://api.opendota.com/api",
    });
    expect(await source.wardCells()).toMatchObject({
      games: 300,
      patch: "7.41",
      currentPatch: "7.42",
    });
    expect(gw.sqls.some((s) => s.includes("match_patch.patch = '7.41'"))).toBe(true);
  });
});
