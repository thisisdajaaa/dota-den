import { describe, expect, it } from "vitest";
import { bestHeroOf, rankWeek } from "@/modules/leaderboards/domain/ranked-week";

const p = (accountId32: number, wins: number, losses: number) => ({
  accountId32,
  wins,
  losses,
  bestHero: null,
});

describe("rankWeek", () => {
  it("ranks by net wins, then win rate, sharing ranks on ties, and lists who didn't play", () => {
    const { rows, idle } = rankWeek([p(1, 5, 5), p(2, 6, 2), p(3, 0, 0), p(4, 4, 0), p(5, 4, 0)]);
    expect(rows.map((r) => [r.accountId32, r.rank, r.estimatedNet])).toEqual([
      [4, 1, 100],
      [5, 1, 100],
      [2, 3, 100],
      [1, 4, 0],
    ]);
    expect(idle).toEqual([3]);
  });
});

describe("bestHeroOf", () => {
  it("picks the most wins from 2+ games", () => {
    expect(
      bestHeroOf([
        { heroId: 1, games: 1, wins: 1 },
        { heroId: 2, games: 5, wins: 3 },
        { heroId: 3, games: 3, wins: 3 },
      ]),
    ).toEqual({ heroId: 3, games: 3, wins: 3 });
    expect(bestHeroOf([{ heroId: 1, games: 1, wins: 1 }])).toBeNull();
  });
});
