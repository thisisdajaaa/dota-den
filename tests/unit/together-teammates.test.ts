import { describe, expect, it } from "vitest";
import {
  bestTeammate,
  mostPlayedWith,
  recentQueueMix,
  rivals,
  shrunkRate,
  sortTeammates,
  teammateStats,
  usualWithout,
  type PeerRecord,
} from "@/modules/together/domain/teammates";

const day = (n: number) => new Date(Date.UTC(2026, 8, n));
const peer = (id: number, over: Partial<PeerRecord> = {}): PeerRecord => ({
  accountId32: id,
  withGames: 0,
  withWins: 0,
  againstGames: 0,
  againstWins: 0,
  lastPlayedAt: null,
  ...over,
});

describe("usualWithout", () => {
  it("is your record in games without that teammate", () => {
    expect(
      usualWithout({ games: 100, wins: 55 }, peer(1, { withGames: 20, withWins: 15 })),
    ).toEqual({ games: 80, wins: 40 });
  });

  it("refuses inconsistent upstream counts rather than inventing a baseline", () => {
    expect(
      usualWithout({ games: 10, wins: 5 }, peer(1, { withGames: 20, withWins: 10 })),
    ).toBeNull();
    expect(
      usualWithout({ games: 30, wins: 2 }, peer(1, { withGames: 10, withWins: 5 })),
    ).toBeNull();
  });
});

describe("teammateStats", () => {
  const overall = { games: 200, wins: 100 };

  it("compares win rate together with your usual win rate", () => {
    const [t] = teammateStats([peer(1, { withGames: 40, withWins: 28 })], overall);
    expect(t.winRate).toBeCloseTo(0.7);
    expect(t.usualRate).toBeCloseTo(72 / 160);
    expect(t.delta).toBeCloseTo(0.7 - 72 / 160);
    expect(t.lowSample).toBe(false);
  });

  it("never shows a difference below the sample threshold", () => {
    const [t] = teammateStats([peer(1, { withGames: 9, withWins: 9 })], overall);
    expect(t).toMatchObject({ lowSample: true, delta: null });
  });

  it("has no usual rate without your overall record", () => {
    const [t] = teammateStats([peer(1, { withGames: 40, withWins: 20 })], null);
    expect(t).toMatchObject({ usualRate: null, delta: null });
  });

  it("drops people you only played against", () => {
    expect(teammateStats([peer(1, { againstGames: 5 })], overall)).toEqual([]);
  });
});

describe("sortTeammates", () => {
  const stats = teammateStats(
    [
      peer(1, { withGames: 50, withWins: 25, lastPlayedAt: day(1) }),
      peer(2, { withGames: 12, withWins: 9, lastPlayedAt: day(5) }),
      peer(3, { withGames: 3, withWins: 3, lastPlayedAt: day(9) }),
    ],
    { games: 300, wins: 150 },
  );

  it("sorts by games, recent, or win rate (leaving out tiny samples)", () => {
    expect(sortTeammates(stats, "games").map((t) => t.accountId32)).toEqual([1, 2, 3]);
    expect(sortTeammates(stats, "recent").map((t) => t.accountId32)).toEqual([3, 2, 1]);
    expect(sortTeammates(stats, "winrate").map((t) => t.accountId32)).toEqual([2, 1]);
  });
});

describe("bestTeammate", () => {
  it("ranks on a win rate pulled toward your usual, so volume beats a short streak", () => {
    const overall = { games: 1_000, wins: 500 };
    const stats = teammateStats(
      [
        peer(1, { withGames: 10, withWins: 8 }), // 80% on 10 games
        peer(2, { withGames: 200, withWins: 140 }), // 70% on 200 games
      ],
      overall,
    );
    const best = bestTeammate(stats, overall)!;
    expect(best.teammate.accountId32).toBe(2);
    expect(best.adjustedRate).toBeCloseTo(shrunkRate(140, 200, best.baselineRate));
  });

  it("is null without enough games or an overall record", () => {
    expect(
      bestTeammate(teammateStats([peer(1, { withGames: 5, withWins: 5 })], null), null),
    ).toBeNull();
  });
});

describe("mostPlayedWith and rivals", () => {
  const peers = [
    peer(1, { withGames: 54, againstGames: 3 }),
    peer(2, { withGames: 12 }),
    peer(3, { againstGames: 3, lastPlayedAt: day(2) }),
    peer(4, { againstGames: 2 }),
    peer(5, { withGames: 8, againstGames: 6 }),
  ];

  it("finds who you've played with most", () => {
    expect(mostPlayedWith(peers)?.accountId32).toBe(1);
    expect(mostPlayedWith([peer(1, { againstGames: 9 })])).toBeNull();
  });

  it("calls someone a rival only when met more often as an opponent", () => {
    expect(rivals(peers).map((p) => p.accountId32)).toEqual([3]);
    expect(
      rivals([...peers, peer(6, { againstGames: 20, withGames: 1 })]).map((p) => p.accountId32),
    ).toEqual([6, 3]);
  });
});

describe("recentQueueMix", () => {
  it("splits recent games into party, solo and unknown (missing data is never solo)", () => {
    const games = [
      ...Array.from({ length: 6 }, () => ({ queueClass: "solo" as const })),
      ...Array.from({ length: 4 }, () => ({ queueClass: "party" as const })),
      ...Array.from({ length: 12 }, () => ({ queueClass: "unknown" as const })),
    ];
    expect(recentQueueMix(games)).toEqual({ games: 20, party: 4, solo: 6, unknown: 10 });
    expect(recentQueueMix([])).toEqual({ games: 0, party: 0, solo: 0, unknown: 0 });
  });
});
