import { describe, expect, it, vi } from "vitest";
import { ProviderGateway, type SharedResponseCache } from "@/common/providers/provider-gateway";
import {
  overviewPools,
  rankByPosition,
  type HeroPublicStats,
} from "@/modules/meta/domain/meta-stats";
import { tipsFor } from "@/modules/meta/domain/patch-tips";
import type { Position } from "@/modules/meta/domain/position";
import {
  mainPosition,
  MIN_POSITION_GAMES,
  MIN_POSITION_SHARE,
  positionCandidates,
  shareAt,
  type PositionStats,
} from "@/modules/meta/domain/position-stats";
import {
  parsePositionStats,
  POSITION_STATS_QUERY,
  StratzPositionSource,
  STRATZ_DAYS,
} from "@/modules/meta/infrastructure/stratz-position-source";
import { MetaService } from "@/modules/meta/meta.service";
import type { MetaStatsSource, PositionStatsSource } from "@/modules/meta/meta.ports";

const DAY_S = 86_400;
const NOW = new Date("2026-10-24T12:00:00Z");
/** 2026-10-04 and 2026-10-10 (UTC), as STRATZ sends days: seconds at midnight. */
const OCT_4 = Date.UTC(2026, 9, 4) / 1000;
const OCT_10 = OCT_4 + 6 * DAY_S;

type Split = Partial<Record<Position, { games: number; rate: number }>>;

/** A STRATZ answer: one row per hero, position and day, splitting `games` evenly over days. */
function stratzBody(heroes: Record<number, Split>, days = [OCT_4, OCT_10]) {
  const heroStats: Record<string, unknown[]> = { pos1: [], pos2: [], pos3: [], pos4: [], pos5: [] };
  for (const [heroId, split] of Object.entries(heroes))
    for (const [pos, { games, rate }] of Object.entries(split))
      for (const day of days) {
        const matchCount = Math.round(games / days.length);
        heroStats[`pos${pos}`].push({
          heroId: Number(heroId),
          day,
          matchCount,
          winCount: Math.round(matchCount * rate),
        });
      }
  // Every position needs at least one row; pad with an unplayed hero.
  for (const rows of Object.values(heroStats))
    if (rows.length === 0) rows.push({ heroId: 999, day: OCT_4, matchCount: 0, winCount: 0 });
  return { data: { heroStats } };
}

function statsFrom(heroes: Record<number, Split>): PositionStats {
  const res = parsePositionStats(stratzBody(heroes), NOW);
  if (!res.ok) throw new Error(JSON.stringify(res.error));
  return res.value;
}

// Bounty Hunter's real split (Ancient–Immortal, Oct 4–10 2026): 80% Pos 4, 16% Pos 5.
const BOUNTY = 62;
const HEROES: Record<number, Split> = {
  [BOUNTY]: {
    1: { games: 700, rate: 0.5 },
    2: { games: 1_900, rate: 0.5 },
    3: { games: 2_200, rate: 0.5 },
    4: { games: 81_000, rate: 0.55 },
    5: { games: 15_900, rate: 0.53 },
  },
  // A real carry.
  8: { 1: { games: 200_000, rate: 0.535 }, 2: { games: 2_600, rate: 0.5 } },
  // A mid who wins a lot in a few Pos 1 games (Leshrac in October 2026).
  52: {
    1: { games: 6_300, rate: 0.6 },
    2: { games: 20_000, rate: 0.51 },
    3: { games: 6_000, rate: 0.5 },
  },
  // An offlaner.
  96: { 3: { games: 70_000, rate: 0.53 }, 4: { games: 1_500, rate: 0.5 } },
  // A hard support.
  50: { 5: { games: 42_000, rate: 0.533 }, 4: { games: 12_000, rate: 0.52 } },
  // Plays Pos 4 rarely: 900 games is under the minimum even at a 20% share.
  77: { 4: { games: 900, rate: 0.7 }, 2: { games: 3_600, rate: 0.5 } },
};

describe("STRATZ position stats parsing", () => {
  it("adds up days per hero and position and reads the window", () => {
    const stats = statsFrom(HEROES);
    expect(stats.window).toEqual({ from: "2026-10-04", to: "2026-10-10", days: 2 });
    expect(stats.heroes.get(BOUNTY)?.[4]).toEqual({ games: 81_000, wins: 44_550 });
    expect(stats.heroes.get(8)?.[3]).toEqual({ games: 0, wins: 0 });
  });

  it("rejects malformed rows, missing positions and GraphQL errors instead of guessing", () => {
    const bad = stratzBody(HEROES);
    (bad.data.heroStats.pos4[0] as { winCount: number }).winCount = 10_000_000;
    expect(parsePositionStats(bad, NOW)).toMatchObject({
      ok: false,
      error: { type: "invalid_payload" },
    });
    const missing = stratzBody(HEROES) as { data: { heroStats: Record<string, unknown> } };
    delete missing.data.heroStats.pos3;
    expect(parsePositionStats(missing, NOW).ok).toBe(false);
    expect(
      parsePositionStats(
        { ...stratzBody(HEROES), errors: [{ message: "Too many requests" }] },
        NOW,
      ),
    ).toMatchObject({ ok: false, error: { type: "unavailable" } });
    expect(parsePositionStats({ errors: [{ message: "Unauthorized" }] }, NOW)).toMatchObject({
      ok: false,
      error: { type: "unavailable" },
    });
    expect(parsePositionStats("nope", NOW).ok).toBe(false);
  });

  it("refuses data that has stopped updating", () => {
    const res = parsePositionStats(stratzBody(HEROES), new Date("2026-12-01T00:00:00Z"));
    expect(res).toMatchObject({ ok: false, error: { cause: "stratz data too old" } });
  });

  it("asks for all five positions at Ancient–Immortal in one query", () => {
    for (const p of [1, 2, 3, 4, 5])
      expect(POSITION_STATS_QUERY).toContain(
        `pos${p}: winDay(take: $days, positionIds: [POSITION_${p}]`,
      );
    expect(STRATZ_DAYS).toBe(7);
  });
});

describe("position assignment", () => {
  const stats = statsFrom(HEROES);

  it("counts a hero for a position by its share and games there, not its catalog roles", () => {
    const at = (p: Position) => positionCandidates(stats, p).map((c) => c.heroId);
    // Bounty Hunter (catalog: Escape, Nuker) is a Pos 4 and, at 16%, a Pos 5 too.
    expect(at(4)).toContain(BOUNTY);
    expect(at(5)).toContain(BOUNTY);
    expect(at(1)).not.toContain(BOUNTY);
    expect(at(3)).not.toContain(BOUNTY);
    // Leshrac-style: 19% of its games at Pos 1 still counts there.
    expect(at(1)).toEqual([8, 52]);
    // 900 games at Pos 4 is too few, whatever the share.
    expect(at(4)).not.toContain(77);
    expect(MIN_POSITION_SHARE).toBe(0.15);
    expect(MIN_POSITION_GAMES).toBe(1_000);
    expect(mainPosition(stats, BOUNTY)).toBe(4);
    expect(shareAt(stats, BOUNTY, [4, 5])).toBeCloseTo(96_900 / 101_700, 6);
  });

  it("ranks by win rate at the position, with OpenDota trends and tournaments as nudges", () => {
    const ranked = rankByPosition(4, stats, {
      publicStats: new Map(),
      pro: {
        drafts: 100,
        windowDays: 21,
        heroes: [{ heroId: 50, picks: 40, bans: 40, leagues: 3 }],
      },
      allPicksTrend: [],
    });
    expect(ranked.map((h) => h.heroId)).toEqual([BOUNTY, 50]);
    expect(ranked[0].atPosition).toMatchObject({ position: 4, games: 81_000, wins: 44_550 });
    expect(ranked[0].atPosition?.share).toBeCloseTo(81_000 / 101_700, 6);
    // Ranked without OpenDota's stats: no high-rank record or trend is made up.
    expect(ranked[0].highRank).toBeNull();
    expect(ranked[0].trend).toBeNull();
    expect(ranked[0].lane).toBeNull();
    expect(ranked[1].pro?.contestRate).toBeCloseTo(0.8);
    expect(tipsFor(ranked[0], 4, null).map((t) => t.kind)).toEqual(["position"]);
    expect(tipsFor(ranked[0], 4, null)[0].text).toBe(
      "Wins 55% of 81,000 Ancient–Immortal games at Pos 4",
    );
  });

  it("puts each hero in the pool where most of its games are, shown at its main position there", () => {
    const pub: HeroPublicStats[] = [];
    const byPosition = new Map(
      ([1, 2, 3, 4, 5] as const).map((p) => [
        p,
        rankByPosition(p, stats, {
          publicStats: new Map(pub.map((s) => [s.heroId, s])),
          pro: null,
          allPicksTrend: [],
        }),
      ]),
    );
    const pools = overviewPools(byPosition, 3, stats);
    const [carry, core, support] = pools.map((p) => p.heroes.map((h) => h.heroId));
    expect(carry).toEqual([8]);
    // The Leshrac-style mid tops the Pos 1 ranking but is listed as a mid.
    expect(core).toContain(52);
    expect(core).toContain(96);
    expect(support).toEqual([BOUNTY, 50]);
    const bounty = pools[2].heroes[0];
    expect(bounty.atPosition?.position).toBe(4);
    expect(pools[1].heroes.find((h) => h.heroId === 52)?.atPosition?.position).toBe(2);
  });
});

function stratzSource(
  handler: () => { status?: number; body: unknown },
  sharedCache?: SharedResponseCache,
) {
  let now = NOW;
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => {
    const r = handler();
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  const gateway = new ProviderGateway({
    name: "stratz",
    fetch,
    sleep: async () => {},
    maxRetries: 0,
    now: () => now.getTime(),
    sharedCache,
  });
  const source = new StratzPositionSource(gateway, {
    baseUrl: "https://stratz.test/",
    token: "test-token",
    now: () => now,
  });
  return { source, fetch, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe("StratzPositionSource", () => {
  it("posts the query with the token and STRATZ's user agent, and caches the answer", async () => {
    const { source, fetch } = stratzSource(() => ({ body: stratzBody(HEROES) }));
    const res = await source.positionStats();
    expect(res.ok && res.value.fetchedAt).toEqual(NOW);
    expect(res.ok && res.value.value.heroes.size).toBe(Object.keys(HEROES).length);
    await source.positionStats();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://stratz.test/graphql");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer test-token",
      "user-agent": "STRATZ_API",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      query: POSITION_STATS_QUERY,
      variables: { days: 7, brackets: ["ANCIENT", "DIVINE", "IMMORTAL"] },
    });
  });

  it("serves the last good value when STRATZ fails, and waits before asking again", async () => {
    let fail = false;
    const { source, fetch, advance } = stratzSource(() =>
      fail ? { status: 503, body: {} } : { body: stratzBody(HEROES) },
    );
    await source.positionStats();
    fail = true;
    advance(13 * 3_600_000);
    const stale = await source.positionStats();
    expect(stale.ok && stale.value.fetchedAt).toEqual(NOW);
    expect(fetch).toHaveBeenCalledTimes(2);
    // Within the wait after a failure: no call.
    advance(60_000);
    expect((await source.positionStats()).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    // Past the 48h grace: the failure shows.
    advance(48 * 3_600_000);
    expect((await source.positionStats()).ok).toBe(false);
  });

  it("doesn't cache a GraphQL error answer", async () => {
    let errors = true;
    const { source, fetch, advance } = stratzSource(() => ({
      body: errors ? { errors: [{ message: "rate limited" }] } : stratzBody(HEROES),
    }));
    expect(await source.positionStats()).toMatchObject({
      ok: false,
      error: { type: "unavailable" },
    });
    errors = false;
    advance(5 * 60_000 + 1);
    expect((await source.positionStats()).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares answers across servers without the token in the cache key", async () => {
    const store = new Map<string, { value: never; expiresAt: number }>();
    const shared: SharedResponseCache = {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => {
        store.set(key, { value: value as never, expiresAt: Number.MAX_SAFE_INTEGER });
      },
    };
    const first = stratzSource(() => ({ body: stratzBody(HEROES) }), shared);
    await first.source.positionStats();
    const second = stratzSource(() => ({ body: stratzBody(HEROES) }), shared);
    expect((await second.source.positionStats()).ok).toBe(true);
    expect(second.fetch).not.toHaveBeenCalled();
    expect([...store.keys()].some((k) => k.includes("test-token"))).toBe(false);
  });
});

describe("MetaService with STRATZ", () => {
  const fetchedAt = new Date("2026-10-24T10:00:00Z");
  // Catalog roles that would misplace Bounty Hunter (not a "Support" hero).
  const catalog = [
    { id: BOUNTY, roles: ["Escape", "Nuker"] },
    { id: 8, roles: ["Carry"] },
    { id: 52, roles: ["Support", "Nuker"] },
    { id: 96, roles: ["Initiator"] },
    { id: 50, roles: ["Support"] },
  ];
  const publicStats: HeroPublicStats[] = catalog.map((h) => ({
    heroId: h.id,
    games: 100_000,
    wins: 51_000,
    pickTrend: [],
  }));
  const down = { ok: false as const, error: { type: "unavailable" as const, cause: "down" } };

  function service(opts: { positions?: PositionStatsSource | null; heroStatsDown?: boolean } = {}) {
    const laneRoles = vi.fn<MetaStatsSource["laneRoles"]>(async (id) => {
      // Lane data alone puts Bounty Hunter in the off lane (Pos 3 or 4).
      const lane = id === 8 ? 1 : id === 50 ? 1 : id === 52 ? 2 : 3;
      return {
        ok: true,
        value: { fetchedAt, value: new Map([[lane, { games: 500, wins: 270 }]]) },
      };
    });
    const svc = new MetaService({
      heroes: async () => catalog,
      lanes: { recentLanes: async () => ({ ok: false, error: { type: "not_found" } }) },
      positions: opts.positions === undefined ? undefined : () => opts.positions ?? null,
      stats: {
        heroStats: async () =>
          opts.heroStatsDown ? down : { ok: true, value: { fetchedAt, value: publicStats } },
        laneRoles,
        proDrafts: async () => down,
        proLaneDuos: async () => down,
      },
    });
    return { svc, laneRoles };
  }
  const stratzUp: PositionStatsSource = {
    positionStats: async () => ({ ok: true, value: { fetchedAt: NOW, value: statsFrom(HEROES) } }),
  };
  const stratzDown: PositionStatsSource = { positionStats: async () => down };

  it("ranks from STRATZ without lane lookups and puts Bounty Hunter with the supports", async () => {
    const { svc, laneRoles } = service({ positions: stratzUp });
    const top = await svc.topHeroes(4);
    expect(top.ok).toBe(true);
    if (!top.ok) return;
    expect(top.value.heroes[0].heroId).toBe(BOUNTY);
    expect(top.value.sources.lane).toBe("not_used");
    expect(top.value.sources.positions).toEqual({
      status: "ok",
      fetchedAt: NOW,
      window: { from: "2026-10-04", to: "2026-10-10", days: 2 },
    });
    expect(top.value.sources.publicFetchedAt).toEqual(fetchedAt);

    const overview = await svc.overview();
    expect(overview.ok).toBe(true);
    if (!overview.ok) return;
    const [carry, core, support] = overview.value.pools.map((p) => p.heroes.map((h) => h.heroId));
    expect(support[0]).toBe(BOUNTY);
    expect(core).not.toContain(BOUNTY);
    expect(carry).toEqual([8]);
    expect(overview.value.positions?.window.to).toBe("2026-10-10");
    expect(overview.value.fetchedAt).toEqual(NOW);
    expect(laneRoles).not.toHaveBeenCalled();
  });

  it("still ranks from STRATZ when OpenDota's hero stats fail", async () => {
    const { svc } = service({ positions: stratzUp, heroStatsDown: true });
    const top = await svc.topHeroes(4);
    expect(top.ok && top.value.heroes[0].heroId).toBe(BOUNTY);
    expect(top.ok && top.value.sources.publicFetchedAt).toBeNull();
    expect(top.ok && top.value.heroes[0].highRank).toBeNull();
  });

  it("falls back to lane data and roles when STRATZ is down, and says so", async () => {
    const { svc, laneRoles } = service({ positions: stratzDown });
    const top = await svc.topHeroes(3);
    expect(top.ok && top.value.sources.positions).toEqual({ status: "unavailable" });
    expect(top.ok && top.value.heroes.every((h) => h.atPosition === null)).toBe(true);
    expect(laneRoles).toHaveBeenCalled();
    const overview = await svc.overview();
    expect(overview.ok && overview.value.positions).toBeNull();
    // Today's behaviour: lane data puts Bounty Hunter (a core by its roles) in the off lane.
    expect(overview.ok && overview.value.pools[1].heroes.map((h) => h.heroId)).toContain(BOUNTY);
  });

  it("behaves as before without a STRATZ source", async () => {
    for (const positions of [undefined, null]) {
      const { svc, laneRoles } = service({ positions });
      const top = await svc.topHeroes(3);
      expect(top.ok && top.value.sources.positions).toEqual({ status: "off" });
      expect(laneRoles).toHaveBeenCalled();
      const warm = await svc.warmCaches();
      expect(warm.map((r) => r.key)).toEqual(["proDrafts", "proLaneDuos", "laneRoles"]);
    }
  });

  it("warms the STRATZ stats in the daily job", async () => {
    const positionStats = vi.fn(stratzUp.positionStats);
    const { svc, laneRoles } = service({ positions: { positionStats } });
    const warm = await svc.warmCaches();
    expect(warm).toContainEqual({ key: "positionStats", ok: true });
    expect(warm).toContainEqual({ key: "laneRoles", ok: true });
    expect(positionStats).toHaveBeenCalled();
    expect(laneRoles).not.toHaveBeenCalled();
    const failing = service({ positions: stratzDown });
    expect(await failing.svc.warmCaches()).toContainEqual({ key: "positionStats", ok: false });
  });
});
