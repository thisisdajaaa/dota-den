import { describe, expect, it, vi } from "vitest";
import { err } from "@/common/result";
import type { HeroPublicStats, RankedHero } from "@/modules/meta/domain/meta-stats";
import { tipsFor } from "@/modules/meta/domain/patch-tips";
import type { Position } from "@/modules/meta/domain/position";
import type { PositionStats } from "@/modules/meta/domain/position-stats";
import {
  BRACKET_MEDALS,
  bracketForRankTier,
  bracketLabel,
  bracketStats,
  chooseBracket,
  DEFAULT_BRACKET,
  META_BRACKETS,
  metaUrl,
  MIN_BRACKET_GAMES,
  parseBracket,
  rankInBracket,
  type Medal,
} from "@/modules/meta/domain/rank-bracket";
import { MetaService } from "@/modules/meta/meta.service";
import type { MetaStatsSource, PositionStatsSource } from "@/modules/meta/meta.ports";

type Medals = Partial<Record<Medal, { games: number; wins: number }>>;

const hero = (heroId: number, medals: Medals, pickTrend: number[] = []): HeroPublicStats => {
  const high = ([6, 7, 8] as const).map((m) => medals[m] ?? { games: 0, wins: 0 });
  return {
    heroId,
    games: high.reduce((n, c) => n + c.games, 0),
    wins: high.reduce((n, c) => n + c.wins, 0),
    pickTrend,
    medals,
  };
};

const placed = (heroId: number, extra: Partial<RankedHero> = {}): RankedHero => ({
  heroId,
  score: 0.1,
  highRank: { games: 50_000, wins: 27_000, rate: 0.54, adjusted: 0.54 },
  lane: null,
  atPosition: { position: 1, games: 5_000, wins: 2_700, rate: 0.54, adjusted: 0.54, share: 0.8 },
  laneKnown: false,
  pro: {
    heroId,
    picks: 30,
    bans: 30,
    leagues: 3,
    drafts: 100,
    windowDays: 21,
    contestRate: 0.6,
  },
  trend: null,
  bracket: null,
  ...extra,
});

describe("rank brackets", () => {
  it("matches STRATZ's basic brackets, plus the high-rank default", () => {
    expect(META_BRACKETS.map(bracketLabel)).toEqual([
      "Herald–Guardian",
      "Crusader–Archon",
      "Legend–Ancient",
      "Divine–Immortal",
      "Ancient–Immortal",
    ]);
    expect(DEFAULT_BRACKET).toBe("ancient-immortal");
    expect(BRACKET_MEDALS[DEFAULT_BRACKET]).toEqual([6, 7, 8]);
  });

  it("parses only known brackets from the URL", () => {
    expect(parseBracket("herald-guardian")).toBe("herald-guardian");
    expect(parseBracket("ancient-immortal")).toBe("ancient-immortal");
    expect(parseBracket("HERALD_GUARDIAN")).toBeNull();
    expect(parseBracket("pro")).toBeNull();
    expect(parseBracket(["herald-guardian"])).toBeNull();
    expect(parseBracket(undefined)).toBeNull();
  });

  it("finds a player's bracket from their rank medal, never guessing without one", () => {
    expect(bracketForRankTier(11)).toBe("herald-guardian");
    expect(bracketForRankTier(25)).toBe("herald-guardian");
    expect(bracketForRankTier(31)).toBe("crusader-archon");
    expect(bracketForRankTier(45)).toBe("crusader-archon");
    expect(bracketForRankTier(52)).toBe("legend-ancient");
    expect(bracketForRankTier(65)).toBe("legend-ancient");
    expect(bracketForRankTier(71)).toBe("divine-immortal");
    expect(bracketForRankTier(80)).toBe("divine-immortal");
    expect(bracketForRankTier(null)).toBeNull();
    expect(bracketForRankTier(undefined)).toBeNull();
    expect(bracketForRankTier(0)).toBeNull();
    expect(bracketForRankTier(5)).toBeNull();
    expect(bracketForRankTier(90)).toBeNull();
    expect(bracketForRankTier(52.5)).toBeNull();
  });

  it("shows the URL's bracket first, then the viewer's own, then the default", () => {
    expect(chooseBracket("crusader-archon", 75)).toEqual({
      bracket: "crusader-archon",
      reason: "url",
      yours: "divine-immortal",
    });
    expect(chooseBracket(undefined, 35)).toEqual({
      bracket: "crusader-archon",
      reason: "yours",
      yours: "crusader-archon",
    });
    // A bad link falls back the same way as no link.
    expect(chooseBracket("nope", 12).bracket).toBe("herald-guardian");
    expect(chooseBracket(undefined, null)).toEqual({
      bracket: DEFAULT_BRACKET,
      reason: "default",
      yours: null,
    });
  });

  it("builds shareable Meta links", () => {
    expect(metaUrl(null, null)).toBe("/meta");
    expect(metaUrl(1, null)).toBe("/meta?pos=1");
    expect(metaUrl(null, "herald-guardian")).toBe("/meta?bracket=herald-guardian");
    expect(metaUrl(3, "legend-ancient")).toBe("/meta?pos=3&bracket=legend-ancient");
  });
});

describe("bracket stats", () => {
  it("adds up the bracket's medals and counts its matches", () => {
    const stats = bracketStats(
      [
        hero(1, { 1: { games: 600, wins: 330 }, 2: { games: 900, wins: 450 } }),
        hero(2, { 1: { games: 400, wins: 180 }, 3: { games: 5_000, wins: 2_600 } }),
      ],
      "herald-guardian",
    );
    expect([...stats.heroes]).toEqual([
      [1, { games: 1_500, wins: 780 }],
      [2, { games: 400, wins: 180 }],
    ]);
    // 1,900 picks over 10 players a match.
    expect(stats.matches).toBe(190);
    expect(stats.emptyMedals).toEqual([]);
  });

  it("reports a medal with no games instead of pretending it's covered", () => {
    // OpenDota often has no Immortal games at all.
    const stats = bracketStats(
      [hero(1, { 7: { games: 3_000, wins: 1_600 } }), hero(2, { 7: { games: 2_000, wins: 900 } })],
      "divine-immortal",
    );
    expect(stats.emptyMedals).toEqual([8]);
    expect(stats.heroes.get(1)).toEqual({ games: 3_000, wins: 1_600 });
  });

  it("skips broken counts and heroes without medal data", () => {
    const stats = bracketStats(
      [hero(1, { 3: { games: 10, wins: 11 } }), { heroId: 2, games: 100, wins: 50, pickTrend: [] }],
      "crusader-archon",
    );
    expect(stats.heroes.size).toBe(0);
    expect(stats.matches).toBe(0);
    expect(stats.emptyMedals).toEqual([3, 4]);
  });
});

describe("ranking in a bracket", () => {
  const stats = bracketStats(
    [
      // Strong at high ranks, weak low.
      hero(1, { 1: { games: 20_000, wins: 9_400 } }),
      // Weak at high ranks, strong low.
      hero(2, { 1: { games: 20_000, wins: 11_000 } }),
      // A great record on a tiny sample: under the minimum, left out.
      hero(3, { 1: { games: MIN_BRACKET_GAMES - 1, wins: 800 } }),
      // Just over the minimum: kept, but pulled toward 50%.
      hero(4, { 1: { games: MIN_BRACKET_GAMES, wins: 580 } }),
    ],
    "herald-guardian",
  );

  it("orders the placed heroes by their bracket win rate, small samples pulled to 50%", () => {
    const ranked = rankInBracket(
      [placed(1, { score: 0.2 }), placed(2, { score: 0.01 }), placed(3), placed(4)],
      stats,
    );
    expect(ranked.map((h) => h.heroId)).toEqual([2, 4, 1]);
    const [h2, h4] = ranked;
    expect(h2.bracket).toMatchObject({
      bracket: "herald-guardian",
      games: 20_000,
      wins: 11_000,
      rate: 0.55,
    });
    // 58% over 1,000 games, with 1,000 virtual games at 50%: 54%.
    expect(h4.bracket?.rate).toBeCloseTo(0.58);
    expect(h4.bracket?.adjusted).toBeCloseTo(0.54);
    // Share of the bracket's matches: 1,000 picks in (40,000 + 999 + 1,000) / 10 matches.
    expect(h4.bracket?.pickRate).toBeCloseTo(1_000 / 4_200);
  });

  it("only re-orders who plays the position, and drops other brackets' numbers", () => {
    // Hero 2 isn't placed at this position: the bracket can't add it.
    const ranked = rankInBracket([placed(1)], stats);
    expect(ranked.map((h) => h.heroId)).toEqual([1]);
    expect(ranked[0].highRank).toBeNull();
    expect(ranked[0].pro).toBeNull();
    // Where it's played is kept (it says which games it's from in the UI).
    expect(ranked[0].atPosition?.share).toBe(0.8);
  });

  it("tips quote the bracket, not another bracket's position record", () => {
    const [top] = rankInBracket([placed(2)], stats);
    const tips = tipsFor(top, 1, null);
    expect(tips.map((t) => t.kind)).toEqual(["bracket"]);
    expect(tips[0].text).toBe("Wins 55% of 20,000 Herald–Guardian games");
  });
});

describe("MetaService in a bracket", () => {
  const fetchedAt = new Date("2026-11-18T00:00:00Z");
  const down = err({ type: "unavailable" as const, cause: "down" });
  const publicStats = [
    // Hero 1 wins at high ranks, hero 2 in Herald–Guardian.
    hero(1, {
      1: { games: 10_000, wins: 4_700 },
      6: { games: 10_000, wins: 5_500 },
      7: { games: 10_000, wins: 5_500 },
    }),
    hero(2, {
      1: { games: 10_000, wins: 5_500 },
      6: { games: 10_000, wins: 4_800 },
      7: { games: 10_000, wins: 4_800 },
    }),
  ];
  const positionStats: PositionStats = {
    heroes: new Map(
      [1, 2].map((id) => [
        id,
        {
          1: { games: 8_000, wins: 4_000 },
          2: { games: 0, wins: 0 },
          3: { games: 0, wins: 0 },
          4: { games: 0, wins: 0 },
          5: { games: 0, wins: 0 },
        } satisfies Record<Position, { games: number; wins: number }>,
      ]),
    ),
    window: { from: "2026-11-01", to: "2026-11-07", days: 7 },
  };

  function service(positions: PositionStatsSource | null) {
    const proDrafts = vi.fn(async () => down);
    const stats: MetaStatsSource = {
      heroStats: async () => ({ ok: true, value: { fetchedAt, value: publicStats } }),
      laneRoles: async () => ({
        ok: true,
        value: { fetchedAt, value: new Map([[1, { games: 500, wins: 250 }]]) },
      }),
      proDrafts,
      proLaneDuos: async () => down,
    };
    const svc = new MetaService({
      heroes: async () => [
        { id: 1, roles: ["Carry"] },
        { id: 2, roles: ["Carry"] },
      ],
      lanes: { recentLanes: async () => down },
      positions: () => positions,
      stats,
    });
    return { svc, proDrafts };
  }
  const stratz: PositionStatsSource = {
    positionStats: async () => ({ ok: true, value: { fetchedAt, value: positionStats } }),
  };

  it("keeps the default ranking for Ancient–Immortal", async () => {
    const { svc } = service(stratz);
    const res = await svc.topHeroes(1);
    expect(res.ok && res.value.heroes.map((h) => h.heroId)).toEqual([1, 2]);
    expect(res.ok && res.value.sources.bracket).toBeNull();
  });

  it("re-ranks by the bracket, placed by STRATZ, without tournament data", async () => {
    const { svc, proDrafts } = service(stratz);
    const res = await svc.topHeroes(1, "herald-guardian");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.heroes.map((h) => h.heroId)).toEqual([2, 1]);
    expect(res.value.sources.pro).toEqual({ status: "not_used" });
    expect(res.value.sources.bracket).toEqual({
      bracket: "herald-guardian",
      matches: 2_000,
      // The test data has no Guardian games: said, not hidden.
      emptyMedals: [2],
      fetchedAt,
      placedBy: "positions",
    });
    expect(proDrafts).not.toHaveBeenCalled();

    const overview = await svc.overview(3, "herald-guardian");
    expect(overview.ok && overview.value.bracket?.bracket).toBe("herald-guardian");
    expect(overview.ok && overview.value.pools[0].heroes.map((h) => h.heroId)).toEqual([2, 1]);
  });

  it("falls back to OpenDota lane data when STRATZ is off, and says so", async () => {
    const { svc } = service(null);
    const res = await svc.topHeroes(1, "herald-guardian");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.heroes.map((h) => h.heroId)).toEqual([2, 1]);
    expect(res.value.sources.bracket?.placedBy).toBe("lanes");
    expect(res.value.sources.lane).toBe("ok");
  });

  it("fails rather than guessing when OpenDota's hero stats are down", async () => {
    const svc = new MetaService({
      heroes: async () => [{ id: 1, roles: ["Carry"] }],
      lanes: { recentLanes: async () => down },
      positions: () => stratz,
      stats: {
        heroStats: async () => down,
        laneRoles: async () => down,
        proDrafts: async () => down,
        proLaneDuos: async () => down,
      },
    });
    const res = await svc.topHeroes(1, "crusader-archon");
    expect(res.ok).toBe(false);
  });
});
