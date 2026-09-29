import { describe, expect, it, vi } from "vitest";
import { MetaService, mapLimit } from "@/modules/meta/application/meta-service";
import {
  DuoRowSchema,
  OpenDotaMetaSource,
  parseExplorer,
  ProDraftRowSchema,
  PRO_DRAFTS_SQL,
} from "@/modules/meta/infrastructure/opendota-meta-source";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";

describe("explorer parsing", () => {
  it("accepts rows with numeric or string counts", () => {
    const res = parseExplorer(
      {
        command: "SELECT",
        rows: [
          { hero_id: 106, picks: 64, bans: "101", leagues: 7, drafts: "192" },
          { hero_id: 62, picks: "21", bans: 142, leagues: "7", drafts: 192 },
        ],
      },
      ProDraftRowSchema,
    );
    expect(res).toEqual({
      ok: true,
      value: [
        { hero_id: 106, picks: 64, bans: 101, leagues: 7, drafts: 192 },
        { hero_id: 62, picks: 21, bans: 142, leagues: 7, drafts: 192 },
      ],
    });
  });

  it("treats err as a failed query", () => {
    const res = parseExplorer({ err: 'error: relation "x" does not exist' }, ProDraftRowSchema);
    expect(res).toEqual({
      ok: false,
      error: { type: "unavailable", cause: "explorer query error" },
    });
    const withRows = parseExplorer({ rows: [], err: { message: "timeout" } }, DuoRowSchema);
    expect(withRows.ok).toBe(false);
  });

  it("rejects malformed rows instead of guessing", () => {
    expect(
      parseExplorer(
        { rows: [{ h1: 1, h2: 2, lane_role: 1, games: "lots", wins: 1 }] },
        DuoRowSchema,
      ).ok,
    ).toBe(false);
    expect(
      parseExplorer({ rows: [{ h1: 1, h2: 2, lane_role: 1, games: -3, wins: 1 }] }, DuoRowSchema)
        .ok,
    ).toBe(false);
    expect(parseExplorer("nope", DuoRowSchema).ok).toBe(false);
    expect(parseExplorer({}, DuoRowSchema).ok).toBe(false);
  });
});

function sourceWith(handler: (url: URL) => { status?: number; body: unknown }) {
  let now = new Date("2026-09-30T12:00:00Z");
  const fetch = vi.fn(async (url: string) => {
    const r = handler(new URL(url));
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  const gw = () => new ProviderGateway({ name: "t", fetch, sleep: async () => {}, maxRetries: 0 });
  const source = new OpenDotaMetaSource(
    { api: gw(), explorer: gw() },
    { baseUrl: "http://od/api", apiKey: "k", now: () => now },
  );
  return { source, fetch, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe("OpenDotaMetaSource", () => {
  it("combines brackets 6-8 and keeps the pick trend", async () => {
    const { source } = sourceWith(() => ({
      body: [
        {
          id: 1,
          "6_pick": 100,
          "6_win": 50,
          "7_pick": 50,
          "7_win": 30,
          "8_pick": 0,
          "8_win": 0,
          pub_pick_trend: [1, 2, 3, 4, 5, 6, 7],
        },
      ],
    }));
    const res = await source.heroStats();
    expect(res.ok && res.value.value).toEqual([
      { heroId: 1, games: 150, wins: 80, pickTrend: [1, 2, 3, 4, 5, 6, 7] },
    ]);
  });

  it("sums lane-role rows across game-length buckets", async () => {
    const { source, fetch } = sourceWith(() => ({
      body: [
        { hero_id: 1, lane_role: 1, time: 900, games: "17", wins: "11" },
        { hero_id: 1, lane_role: 1, time: 1800, games: "183", wins: "89" },
        { hero_id: 1, lane_role: 2, time: 900, games: "9", wins: "0" },
      ],
    }));
    const res = await source.laneRoles(1);
    expect(res.ok && [...res.value.value]).toEqual([
      [1, { games: 200, wins: 100 }],
      [2, { games: 9, wins: 0 }],
    ]);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/scenarios/laneRoles");
    expect(url.searchParams.get("hero_id")).toBe("1");
  });

  it("sends the pro drafts SQL to the explorer and reads the draft total", async () => {
    const { source, fetch } = sourceWith(() => ({
      body: { rows: [{ hero_id: 5, picks: 3, bans: 4, leagues: 2, drafts: 150 }], err: null },
    }));
    const res = await source.proDrafts();
    expect(res.ok && res.value.value).toEqual({
      drafts: 150,
      windowDays: 21,
      heroes: [{ heroId: 5, picks: 3, bans: 4, leagues: 2 }],
    });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/explorer");
    expect(url.searchParams.get("sql")).toBe(PRO_DRAFTS_SQL);
  });

  it("caches with the fetch time and serves the last good value when a refresh fails", async () => {
    let fail = false;
    const { source, fetch, advance } = sourceWith(() =>
      fail
        ? { status: 500, body: {} }
        : { body: { rows: [{ h1: 1, h2: 2, lane_role: 1, games: 10, wins: 6 }], err: null } },
    );
    const first = await source.proLaneDuos();
    expect(first.ok && first.value.fetchedAt).toEqual(new Date("2026-09-30T12:00:00Z"));
    await source.proLaneDuos();
    expect(fetch).toHaveBeenCalledTimes(1);

    fail = true;
    advance(13 * 3_600_000);
    const stale = await source.proLaneDuos();
    expect(stale.ok && stale.value.fetchedAt).toEqual(new Date("2026-09-30T12:00:00Z"));
    expect(stale.ok && stale.value.value.rows).toHaveLength(1);

    advance(48 * 3_600_000);
    expect((await source.proLaneDuos()).ok).toBe(false);
  });

  it("reads a player's recent lanes", async () => {
    const { source, fetch } = sourceWith(() => ({
      body: [
        { match_id: 1, hero_id: 1, lane_role: 1, is_roaming: false },
        { match_id: 2, hero_id: 2, lane_role: null, is_roaming: null },
        { match_id: 3, lane_role: 1 },
      ],
    }));
    const res = await source.recentLanes(22202);
    expect(res.ok && res.value.value.games).toEqual([
      { heroId: 1, laneRole: 1, isRoaming: false },
      { heroId: 2, laneRole: null, isRoaming: null },
    ]);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/players/22202/matches");
    expect(url.searchParams.getAll("project")).toEqual(["hero_id", "lane_role", "is_roaming"]);
    expect(url.searchParams.get("date")).toBe("60");
  });
});

describe("MetaService", () => {
  it("runs at most `limit` tasks at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(2);
  });

  it("ranks heroes even when tournament data fails, and reports it", async () => {
    const fetchedAt = new Date();
    const service = new MetaService({
      heroes: [
        { id: 1, roles: ["Carry"] },
        { id: 2, roles: ["Carry"] },
      ],
      lanes: { recentLanes: async () => ({ ok: false, error: { type: "not_found" } }) },
      stats: {
        heroStats: async () => ({
          ok: true,
          value: {
            fetchedAt,
            value: [
              { heroId: 1, games: 1000, wins: 550, pickTrend: [] },
              { heroId: 2, games: 1000, wins: 500, pickTrend: [] },
            ],
          },
        }),
        laneRoles: async (id) =>
          id === 1
            ? { ok: true, value: { fetchedAt, value: new Map([[1, { games: 100, wins: 55 }]]) } }
            : { ok: false, error: { type: "unavailable", cause: "x" } },
        proDrafts: async () => ({ ok: false, error: { type: "unavailable", cause: "down" } }),
        proLaneDuos: async () => ({ ok: false, error: { type: "unavailable", cause: "down" } }),
      },
    });
    const res = await service.topHeroes(1);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Hero 2's lane data failed, so it can't be placed in the safe lane.
    expect(res.value.heroes.map((h) => h.heroId)).toEqual([1]);
    expect(res.value.sources.lane).toBe("partial");
    expect(res.value.sources.pro).toEqual({ status: "unavailable" });

    expect((await service.laneDuos(2)).ok).toBe(true);
    expect((await service.laneDuos(1)).ok).toBe(false);
  });
});
