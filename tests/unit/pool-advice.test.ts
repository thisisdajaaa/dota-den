import { describe, expect, it } from "vitest";
import { advisePool, findNemeses, type Candidate } from "@/modules/advisor/domain/pool-advice";

const row = (heroId: number, againstGames: number, againstWins: number, games = 0) => ({
  heroId,
  games,
  wins: 0,
  againstGames,
  againstWins,
});
const cand = (heroId: number): Candidate => ({
  heroId,
  highRank: { rate: 0.53, games: 10_000 },
  contestRate: 0.2,
});

describe("findNemeses", () => {
  it("keeps heroes you clearly lose to, worst first, ignoring small samples", () => {
    const res = findNemeses([
      row(1, 40, 10), // lose 75%
      row(2, 100, 45), // lose 55%
      row(3, 10, 0), // too few games
      row(4, 60, 32), // winning
    ]);
    expect(res.map((n) => n.heroId)).toEqual([1, 2]);
    expect(res[0].lossRate).toBeCloseTo((30 + 10) / 60);
  });
});

describe("advisePool", () => {
  const nemeses = findNemeses([row(90, 60, 18)]);

  it("prefers a strong hero that beats your nemesis, and says why", () => {
    const res = advisePool({
      candidates: [cand(10), cand(11), cand(12)],
      pool: [],
      nemeses,
      matchups: new Map([[12, new Map([[90, { games: 200, wins: 130 }]])]]),
    });
    expect(res[0].heroId).toBe(12);
    expect(res[0].counters).toEqual([
      { nemesisId: 90, games: 200, winRate: 0.65, yourLossRate: nemeses[0].lossRate },
    ]);
  });

  it("skips heroes already in your pool and the nemeses themselves", () => {
    const res = advisePool({
      candidates: [cand(10), cand(90), cand(11)],
      pool: [row(10, 0, 0, 20)],
      nemeses,
      matchups: new Map(),
    });
    expect(res.map((a) => a.heroId)).toEqual([11]);
  });

  it("ignores counter records with too few games", () => {
    const res = advisePool({
      candidates: [cand(10), cand(12)],
      pool: [],
      nemeses,
      matchups: new Map([[12, new Map([[90, { games: 5, wins: 5 }]])]]),
    });
    expect(res[0].heroId).toBe(10);
    expect(res.find((a) => a.heroId === 12)?.counters).toEqual([]);
  });
});
