import { describe, expect, it, vi } from "vitest";
import { HeroesService } from "@/modules/heroes/application/heroes-service";
import type { HeroGameExtras } from "@/modules/heroes/application/ports";
import { OpenDotaHeroSource } from "@/modules/heroes/infrastructure/opendota-hero-source";
import { ok, err } from "@/modules/shared/domain/result";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";

function sourceWith(body: unknown, status = 200) {
  const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
  const gateway = new ProviderGateway({
    name: "opendota",
    fetch,
    sleep: async () => {},
    maxRetries: 0,
  });
  return { source: new OpenDotaHeroSource(gateway, { baseUrl: "http://od.test/api" }), fetch };
}

describe("OpenDotaHeroSource", () => {
  it("reads matchups over games on the hero and caches them", async () => {
    const { source, fetch } = sourceWith([
      {
        hero_id: 1,
        games: 8,
        win: 6,
        with_games: 0,
        with_win: 0,
        against_games: 0,
        against_win: 0,
      },
      {
        hero_id: 101,
        games: 0,
        win: 0,
        with_games: "6",
        with_win: 4,
        against_games: 5,
        against_win: 1,
      },
      { hero_id: "bad" },
    ]);
    const res = await source.matchups(22202, 1);
    expect(res).toEqual(
      ok({
        games: 8,
        rows: [
          { heroId: 1, withGames: 0, withWins: 0, againstGames: 0, againstWins: 0 },
          { heroId: 101, withGames: 6, withWins: 4, againstGames: 5, againstWins: 1 },
        ],
      }),
    );
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/players/22202/heroes");
    expect(url.searchParams.get("hero_id")).toBe("1");
    expect(url.searchParams.get("significant")).toBe("0");
    await source.matchups(22202, 1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reads recent games on the hero with GPM, XPM and purchases", async () => {
    const { source, fetch } = sourceWith([
      {
        match_id: 1,
        gold_per_min: 600,
        xp_per_min: 700,
        purchase: { bkb: 1 },
        start_time: 1_790_000_000,
        duration: 1_800,
        radiant_win: true,
        player_slot: 130,
        last_hits: 210,
        kills: 7,
        deaths: 2,
        assists: 9,
      },
      { match_id: 2, gold_per_min: 500, xp_per_min: null, purchase: null },
      { match_id: -1 },
    ]);
    const res = await source.recentGames(22202, 1, 100);
    expect(res).toEqual(
      ok([
        {
          matchId: "1",
          goldPerMin: 600,
          xpPerMin: 700,
          purchase: { bkb: 1 },
          startedAt: new Date(1_790_000_000 * 1000),
          durationSec: 1_800,
          won: false, // dire slot, radiant won
          lastHits: 210,
          kills: 7,
          deaths: 2,
          assists: 9,
        },
        {
          matchId: "2",
          goldPerMin: 500,
          xpPerMin: null,
          purchase: null,
          startedAt: null,
          durationSec: null,
          won: null,
          lastHits: null,
          kills: null,
          deaths: null,
          assists: null,
        },
      ]),
    );
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/players/22202/matches");
    expect(url.searchParams.get("hero_id")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.getAll("project")).toEqual(
      expect.arrayContaining(["gold_per_min", "xp_per_min", "purchase", "last_hits", "start_time"]),
    );
  });

  it("reports upstream failures instead of empty data", async () => {
    const { source } = sourceWith({ error: "x" }, 429);
    const res = await source.matchups(22202, 1);
    expect(res.ok).toBe(false);
    const bad = await sourceWith({ not: "an array" }).source.recentGames(22202, 1, 10);
    expect(bad).toEqual(err({ type: "invalid_payload", cause: "expected array" }));
  });
});

function service(overrides: Partial<ConstructorParameters<typeof HeroesService>[0]> = {}) {
  const games: HeroGameExtras[] = [
    { matchId: "1", goldPerMin: 600, xpPerMin: 700, purchase: { bkb: 1, tango: 2 } },
    { matchId: "2", goldPerMin: 400, xpPerMin: 500, purchase: null },
  ];
  return new HeroesService({
    own: {
      games: async () => [
        {
          matchId: "1",
          heroId: 1,
          startedAt: new Date("2026-09-01T00:00:00Z"),
          result: "win",
          kills: 1,
          deaths: 1,
          assists: 1,
          patch: "7.41",
        },
        {
          matchId: "2",
          heroId: 2,
          startedAt: new Date("2026-09-02T00:00:00Z"),
          result: "loss",
          kills: 1,
          deaths: 1,
          assists: 1,
          patch: "7.41",
        },
      ],
    },
    player: {
      matchups: async () => ok({ games: 1, rows: [] }),
      recentGames: async () => ok(games),
    },
    highRank: { heroStats: async () => ok([{ heroId: 1, games: 1000, wins: 480 }]) },
    lanes: {
      recentLanes: async () =>
        ok({
          windowDays: 60,
          games: [{ heroId: 1, laneRole: 1, isRoaming: false, result: "win" as const }],
        }),
    },
    heroes: [{ id: 1, roles: ["Carry"] }],
    items: async () =>
      new Map([
        ["bkb", { key: "bkb", qual: "epic", cost: 4050 }],
        ["tango", { key: "tango", qual: "consumable", cost: 90 }],
      ]),
    timeZone: "UTC",
    ...overrides,
  });
}

describe("HeroesService", () => {
  it("summarises only the requested hero's games", async () => {
    const o = await service().overview(22202, 1);
    expect(o.record.games).toBe(1);
    expect(o.trend.buckets).toHaveLength(1);
  });

  it("averages farm and leaves items out when the catalog is unavailable", async () => {
    const d = await service().details(22202, 1);
    expect(d.ok && d.value.gpm).toEqual({ average: 500, games: 2 });
    expect(d.ok && d.value.items?.withData).toBe(1);
    const noCatalog = await service({ items: async () => new Map() }).details(22202, 1);
    expect(noCatalog.ok && noCatalog.value.items).toBeNull();
  });

  it("compares with public high-rank games, or says there are none", async () => {
    const s = service();
    const { record } = await s.overview(22202, 1);
    const c = await s.highRank(1, record);
    expect(c.ok && c.value.publicRate).toBe(0.48);
    expect((await s.highRank(2, record)).ok).toBe(false);
  });

  it("needs the hero catalog to read positions", async () => {
    const b = await service().laneBreakdown(22202);
    expect(b.ok && b.value.breakdown.positions[0].games).toBe(1);
    const none = await service({ heroes: [] }).laneBreakdown(22202);
    expect(none.ok).toBe(false);
  });
});
