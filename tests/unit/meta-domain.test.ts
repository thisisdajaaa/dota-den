import { describe, expect, it } from "vitest";
import { duosForPosition, type DuoRow } from "@/modules/meta/domain/lane-duos";
import {
  eligibleByRole,
  laneCandidates,
  pickTrend,
  rankHeroes,
  shrunkRate,
  totalPickTrend,
  type HeroCandidate,
  type HeroPublicStats,
  type ProDrafts,
  type RankedHero,
} from "@/modules/meta/domain/meta-stats";
import { tipsFor, type LatestPatch } from "@/modules/meta/domain/patch-tips";
import {
  deriveRole,
  isSupportHero,
  parsePosition,
  positionBreakdown,
  positionForGame,
  type LaneGame,
} from "@/modules/meta/domain/position";

const CARRY = ["Carry", "Escape"];
const SUPPORT = ["Support", "Disabler"];
const FLEX = ["Carry", "Support", "Nuker"];
const SUPPORT_FIRST = ["Support", "Carry", "Nuker"];
const INITIATOR = ["Initiator", "Durable"];

describe("positions", () => {
  it("parses only 1-5", () => {
    expect(parsePosition("1")).toBe(1);
    expect(parsePosition("5")).toBe(5);
    expect(parsePosition("0")).toBeNull();
    expect(parsePosition("6")).toBeNull();
    expect(parsePosition("1.5")).toBeNull();
    expect(parsePosition(["2"])).toBeNull();
    expect(parsePosition(undefined)).toBeNull();
  });

  it("counts Support-tagged heroes as supports unless Carry comes first", () => {
    expect(isSupportHero(SUPPORT)).toBe(true);
    expect(isSupportHero(SUPPORT_FIRST)).toBe(true);
    expect(isSupportHero(FLEX)).toBe(false);
    expect(isSupportHero(CARRY)).toBe(false);
  });

  it("maps lane role plus hero role to a position", () => {
    const g = (laneRole: number | null, isRoaming: boolean | null = false): LaneGame => ({
      heroId: 1,
      laneRole,
      isRoaming,
    });
    expect(positionForGame(g(1), CARRY)).toBe(1);
    expect(positionForGame(g(1), SUPPORT)).toBe(5);
    expect(positionForGame(g(2), SUPPORT)).toBe(2);
    expect(positionForGame(g(3), INITIATOR)).toBe(3);
    expect(positionForGame(g(3), SUPPORT)).toBe(4);
    expect(positionForGame(g(1, true), SUPPORT)).toBe(4);
    expect(positionForGame(g(4), SUPPORT)).toBe(4);
    // A core in the jungle, a game without lane data or an unknown hero: can't tell.
    expect(positionForGame(g(4), CARRY)).toBeNull();
    expect(positionForGame(g(null), CARRY)).toBeNull();
    expect(positionForGame(g(1), undefined)).toBeNull();
    // Mid needs no hero roles.
    expect(positionForGame(g(2), undefined)).toBe(2);
  });

  it("derives the most-played position and counts skipped games", () => {
    const roles = new Map([
      [1, CARRY],
      [2, SUPPORT],
    ]);
    const games: LaneGame[] = [
      ...Array.from({ length: 4 }, () => ({ heroId: 1, laneRole: 1, isRoaming: false })),
      ...Array.from({ length: 2 }, () => ({ heroId: 2, laneRole: 3, isRoaming: false })),
      { heroId: 1, laneRole: null, isRoaming: null },
      { heroId: 99, laneRole: 1, isRoaming: false },
    ];
    const d = deriveRole(games, (id) => roles.get(id));
    expect(d).toEqual({
      position: 1,
      counted: 6,
      skipped: 2,
      byPosition: { 1: 4, 2: 0, 3: 0, 4: 2, 5: 0 },
    });
  });

  it("needs enough games before naming a role; ties go to the lower position", () => {
    const roles = () => CARRY;
    const few = deriveRole([{ heroId: 1, laneRole: 1, isRoaming: false }], roles);
    expect(few.position).toBeNull();
    expect(few.counted).toBe(1);

    const tie = deriveRole(
      [
        ...Array.from({ length: 3 }, () => ({ heroId: 1, laneRole: 3, isRoaming: false })),
        ...Array.from({ length: 3 }, () => ({ heroId: 1, laneRole: 1, isRoaming: false })),
      ],
      roles,
    );
    expect(tie.position).toBe(1);
  });

  it("breaks games down by position with win rates, counting unreadable games by reason", () => {
    const roles = new Map([
      [1, CARRY],
      [2, SUPPORT],
      [3, INITIATOR],
    ]);
    const games: LaneGame[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        heroId: 1,
        laneRole: 1,
        isRoaming: false,
        result: i < 9 ? ("win" as const) : ("loss" as const),
      })),
      { heroId: 2, laneRole: 1, isRoaming: false, result: "loss" },
      { heroId: 2, laneRole: 3, isRoaming: true, result: "win" },
      { heroId: 3, laneRole: 3, isRoaming: false, result: null },
      { heroId: 1, laneRole: null, isRoaming: null, result: "win" },
      { heroId: 1, laneRole: 4, isRoaming: false, result: "win" },
      { heroId: 99, laneRole: 1, isRoaming: false, result: "win" },
    ];
    const b = positionBreakdown(games, (id) => roles.get(id));
    expect(b.total).toBe(18);
    expect(b.counted).toBe(15);
    expect(b.noLaneData).toBe(1);
    expect(b.unplaced).toBe(2);
    const [p1, p2, p3, p4, p5] = b.positions;
    expect(p1).toMatchObject({ position: 1, games: 12, wins: 9, winRate: 0.75, lowSample: false });
    expect(p1.heroes).toEqual([{ heroId: 1, games: 12, wins: 9, decided: 12 }]);
    expect(p2).toMatchObject({ games: 0, winRate: null, lowSample: true });
    // A game without a known result counts as a game but not toward the win rate.
    expect(p3).toMatchObject({ games: 1, decided: 0, winRate: null });
    expect(p4).toMatchObject({ games: 1, wins: 1, winRate: 1, lowSample: true });
    expect(p5).toMatchObject({ games: 1, wins: 0, winRate: 0 });
  });

  it("gives an empty breakdown for no games", () => {
    const b = positionBreakdown([], () => CARRY);
    expect(b).toMatchObject({ total: 0, counted: 0, noLaneData: 0, unplaced: 0 });
    expect(b.positions.every((p) => p.games === 0)).toBe(true);
  });
});

describe("shrinkage", () => {
  it("pulls small samples toward 50% and leaves big ones nearly alone", () => {
    expect(shrunkRate(3, 3, 10)).toBeCloseTo(8 / 13);
    expect(shrunkRate(0, 0, 10)).toBe(0.5);
    expect(shrunkRate(5_500, 10_000, 100)).toBeCloseTo(0.5495, 3);
    // A 3-0 record doesn't beat 550-450 once shrunk.
    expect(shrunkRate(3, 3, 100)).toBeLessThan(shrunkRate(550, 1000, 100));
  });
});

describe("pick trend", () => {
  it("compares share of picks, so traffic swings cancel out", () => {
    // Everyone doubles on the weekend; this hero's share stays flat.
    const all = [100, 100, 100, 100, 200, 200, 200];
    const hero = [10, 10, 10, 10, 20, 20, 20];
    expect(pickTrend(hero, all)?.change).toBeCloseTo(0);
    const rising = [10, 10, 10, 10, 24, 24, 24];
    expect(pickTrend(rising, all)?.change).toBeCloseTo(0.2);
  });

  it("gives up on short or empty series", () => {
    expect(pickTrend([1, 2, 3], [10, 20, 30])).toBeNull();
    expect(pickTrend([0, 0, 0, 1, 1, 1], [5, 5, 5, 5, 5, 5])).toBeNull();
  });

  it("totals only full-length series", () => {
    const s = (heroId: number, pickTrend: number[]): HeroPublicStats => ({
      heroId,
      games: 1,
      wins: 1,
      pickTrend,
    });
    expect(totalPickTrend([s(1, [1, 2, 3]), s(2, [10, 20, 30]), s(3, [5])])).toEqual([11, 22, 33]);
  });
});

function stats(heroId: number, games: number, winRate: number): HeroPublicStats {
  return {
    heroId,
    games,
    wins: Math.round(games * winRate),
    pickTrend: [10, 10, 10, 10, 10, 10, 10],
  };
}
const lanes = (entries: Array<[number, number, number]>) =>
  new Map(entries.map(([lane, games, wins]) => [lane, { games, wins }]));
const FLAT = [100, 100, 100, 100, 100, 100, 100];

describe("hero ranking", () => {
  it("keeps heroes that fit the role and play the lane, best adjusted win rates first", () => {
    const candidates: HeroCandidate[] = [
      {
        heroId: 1,
        roles: CARRY,
        publicStats: stats(1, 50_000, 0.53),
        lanes: lanes([[1, 800, 440]]),
      },
      {
        heroId: 2,
        roles: CARRY,
        publicStats: stats(2, 50_000, 0.51),
        lanes: lanes([[1, 800, 400]]),
      },
      // Mostly mid: under 25% of its games in the safe lane.
      {
        heroId: 3,
        roles: CARRY,
        publicStats: stats(3, 50_000, 0.56),
        lanes: lanes([
          [1, 100, 60],
          [2, 900, 500],
        ]),
      },
      // Not a safe-lane carry by role.
      {
        heroId: 4,
        roles: SUPPORT,
        publicStats: stats(4, 50_000, 0.58),
        lanes: lanes([[1, 900, 500]]),
      },
      // No public stats: left out, never guessed.
      { heroId: 5, roles: CARRY, publicStats: null, lanes: lanes([[1, 900, 500]]) },
    ];
    const ranked = rankHeroes(1, candidates, { pro: null, allPicksTrend: FLAT });
    expect(ranked.map((h) => h.heroId)).toEqual([1, 2]);
    expect(ranked[0].highRank).toMatchObject({ games: 50_000, wins: 26_500, rate: 0.53 });
    expect(ranked[0].lane).toMatchObject({ games: 800, wins: 440, rate: 0.55, share: 1 });
    expect(ranked[0].pro).toBeNull();
  });

  it("doesn't let a tiny sample top the list", () => {
    const ranked = rankHeroes(
      3,
      [
        {
          heroId: 1,
          roles: INITIATOR,
          publicStats: stats(1, 40, 0.8),
          lanes: lanes([[3, 30, 25]]),
        },
        {
          heroId: 2,
          roles: INITIATOR,
          publicStats: stats(2, 60_000, 0.54),
          lanes: lanes([[3, 900, 495]]),
        },
      ],
      { pro: null, allPicksTrend: FLAT },
    );
    expect(ranked.map((h) => h.heroId)).toEqual([2, 1]);
  });

  it("adds tournament contest rates only with enough pro drafts", () => {
    const candidates: HeroCandidate[] = [
      {
        heroId: 1,
        roles: SUPPORT,
        publicStats: stats(1, 50_000, 0.5),
        lanes: lanes([[1, 500, 250]]),
      },
      {
        heroId: 2,
        roles: SUPPORT,
        publicStats: stats(2, 50_000, 0.5),
        lanes: lanes([[1, 500, 250]]),
      },
    ];
    const pro: ProDrafts = {
      drafts: 100,
      windowDays: 21,
      heroes: [{ heroId: 2, picks: 30, bans: 34, leagues: 5 }],
    };
    const ranked = rankHeroes(5, candidates, { pro, allPicksTrend: FLAT });
    expect(ranked[0].heroId).toBe(2);
    expect(ranked[0].pro).toMatchObject({ picks: 30, bans: 34, contestRate: 0.64, drafts: 100 });
    // A hero absent from the pro data was never picked or banned.
    expect(ranked[1].pro).toMatchObject({ picks: 0, bans: 0, contestRate: 0 });

    const few = rankHeroes(5, candidates, { pro: { ...pro, drafts: 5 }, allPicksTrend: FLAT });
    expect(few.every((h) => h.pro === null)).toBe(true);
  });

  it("ranks on role alone when lane data is missing, and says so", () => {
    const ranked = rankHeroes(
      2,
      [{ heroId: 1, roles: CARRY, publicStats: stats(1, 50_000, 0.52), lanes: null }],
      { pro: null, allPicksTrend: FLAT },
    );
    expect(ranked[0]).toMatchObject({ heroId: 1, lane: null, laneKnown: false });
  });

  it("picks lane candidates by role and adjusted win rate, within the limit", () => {
    const heroes = [
      { id: 1, roles: SUPPORT },
      { id: 2, roles: SUPPORT },
      { id: 3, roles: CARRY },
      { id: 4, roles: FLEX },
      { id: 5, roles: SUPPORT },
    ];
    const s = new Map([
      [1, stats(1, 10_000, 0.5)],
      [2, stats(2, 10_000, 0.55)],
      [3, stats(3, 10_000, 0.6)],
      [4, stats(4, 10_000, 0.52)],
    ]);
    expect(laneCandidates(5, heroes, s, 2)).toEqual([2, 1]);
    expect(laneCandidates(1, heroes, s, 5)).toEqual([3, 4]);
    expect(eligibleByRole(3, SUPPORT)).toBe(false);
    expect(eligibleByRole(2, FLEX)).toBe(true);
    expect(eligibleByRole(4, FLEX)).toBe(false);
    expect(eligibleByRole(1, INITIATOR)).toBe(false);
  });
});

describe("lane duos", () => {
  const rows: DuoRow[] = [
    { heroA: 1, heroB: 2, laneRole: 1, games: 30, wins: 18 },
    { heroA: 3, heroB: 4, laneRole: 1, games: 8, wins: 7 },
    { heroA: 5, heroB: 6, laneRole: 1, games: 7, wins: 7 },
    { heroA: 7, heroB: 8, laneRole: 3, games: 20, wins: 15 },
    { heroA: 9, heroB: 10, laneRole: 1, games: 10, wins: 11 },
  ];

  it("keeps the position's lane, drops small or broken samples, sorts by shrunk win rate", () => {
    const res = duosForPosition(rows, 5);
    expect(res.kind).toBe("duos");
    if (res.kind !== "duos") return;
    expect(res.laneRole).toBe(1);
    // 7-1 over 8 games (shrunk 0.667) beats 18-12 over 30 (0.575).
    expect(res.duos.map((d) => [d.heroA, d.heroB])).toEqual([
      [3, 4],
      [1, 2],
    ]);
    expect(res.duos[1]).toMatchObject({ games: 30, wins: 18, rate: 0.6 });
  });

  it("uses the off lane for positions 3 and 4", () => {
    const res = duosForPosition(rows, 4);
    expect(res.kind === "duos" && res.duos.map((d) => d.heroA)).toEqual([7]);
  });

  it("has no duos for mid", () => {
    expect(duosForPosition(rows, 2)).toEqual({ kind: "solo_lane" });
  });
});

describe("patch tips", () => {
  const base: RankedHero = {
    heroId: 14,
    score: 0.02,
    highRank: { games: 50_000, wins: 26_000, rate: 0.52, adjusted: 0.52 },
    lane: { games: 900, wins: 495, rate: 0.55, adjusted: 0.54, share: 0.6 },
    laneKnown: true,
    pro: {
      heroId: 14,
      picks: 60,
      bans: 63,
      leagues: 6,
      drafts: 192,
      windowDays: 21,
      contestRate: 123 / 192,
    },
    trend: { change: 0.18, recentPicks: 3000, earlierPicks: 2500 },
  };
  const patch: LatestPatch = {
    version: "7.41",
    publishedAt: new Date("2026-09-20T00:00:00Z"),
    heroes: new Map([
      [14, { heroId: 14, lines: ["Base Armor increased by 1", "Meat Hook: cooldown reduced"] }],
    ]),
  };

  it("states only what the data shows, with links to the patch", () => {
    const tips = tipsFor(base, 3, patch);
    expect(tips).toEqual([
      {
        kind: "patch",
        text: "Changed in 7.41: Base Armor increased by 1",
        href: "/patches/7.41#hero-14",
        more: 1,
      },
      {
        kind: "rising",
        text: "Rising: picked 18% more often in public games over the last 3 days than earlier in the week",
      },
      {
        kind: "contested",
        text: "Contested in tournaments: picked or banned in 64% of 192 pro drafts over the last 21 days",
      },
      { kind: "lane", text: "Wins 55% of 900 public games played in the off lane" },
    ]);
  });

  it("says nothing when nothing stands out", () => {
    const quiet: RankedHero = {
      ...base,
      heroId: 2,
      lane: { ...base.lane!, games: 100 },
      pro: { ...base.pro!, contestRate: 0.1 },
      trend: { change: 0.05, recentPicks: 1, earlierPicks: 1 },
    };
    expect(tipsFor(quiet, 3, patch)).toEqual([]);
    expect(tipsFor({ ...quiet, trend: null, pro: null, lane: null }, 3, null)).toEqual([]);
  });

  it("calls out falling heroes", () => {
    const tips = tipsFor(
      { ...base, trend: { change: -0.25, recentPicks: 1, earlierPicks: 1 } },
      3,
      null,
    );
    expect(tips.map((t) => t.kind)).toEqual(["falling", "contested", "lane"]);
    expect(tips[0].text).toContain("picked 25% less often");
  });
});
