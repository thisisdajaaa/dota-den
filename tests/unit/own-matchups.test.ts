import { describe, expect, it } from "vitest";
import { lineupProgress, ownMatchups, type LineupGame } from "@/modules/heroes/domain/own-matchups";

const game = (
  heroId: number,
  result: "win" | "loss",
  enemies: number[] | null,
  allies: number[] | null = [],
): LineupGame => ({ heroId, result, enemyHeroIds: enemies, allyHeroIds: allies });

const times = (n: number, g: LineupGame) => Array.from({ length: n }, () => g);

describe("ownMatchups", () => {
  it("counts your record against each enemy hero and splits toughest from easiest", () => {
    const games = [
      // Against 50: 1-4 (toughest). Against 60: 4-1 (easiest). Against 70: 2 games (too few).
      ...times(4, game(1, "loss", [50, 70])),
      game(1, "win", [50]),
      ...times(4, game(2, "win", [60])),
      game(2, "loss", [60]),
    ];
    const m = ownMatchups(games);
    expect(m.toughest).toMatchObject([{ heroId: 50, games: 5, wins: 1, losses: 4, winRate: 0.2 }]);
    expect(m.easiest).toMatchObject([{ heroId: 60, games: 5, wins: 4, losses: 1, winRate: 0.8 }]);
    expect(m.enemiesBelowMin).toBe(1);
    expect(m.baseline).toEqual({ games: 10, wins: 5, winRate: 0.5 });
    expect(m.minGames).toBe(5);
  });

  it("ranks by the damped rate, so a big sample beats a small perfect one", () => {
    const games = [
      ...times(5, game(1, "loss", [50])), // 0-5
      ...times(40, game(1, "loss", [60])), // 10-40
      ...times(10, game(1, "win", [60])),
    ];
    // 0/5 damped: 5/15 = 0.33; 10/50 damped: 15/60 = 0.25: the bigger sample is tougher.
    expect(ownMatchups(games).toughest.map((r) => r.heroId)).toEqual([60, 50]);
  });

  it("lists what you played into each enemy, most played first", () => {
    const games = [
      ...times(3, game(7, "loss", [50])),
      game(7, "win", [50]),
      game(8, "loss", [50]),
      game(9, "loss", [50]),
    ];
    expect(ownMatchups(games).toughest[0].playedInto).toEqual([
      { heroId: 7, games: 4, wins: 1, losses: 3 },
      { heroId: 8, games: 1, wins: 0, losses: 1 },
      { heroId: 9, games: 1, wins: 0, losses: 1 },
    ]);
  });

  it("does the same for allied heroes, never counting your own hero as an ally", () => {
    const games = [
      ...times(5, game(1, "win", [90], [20, 1])),
      ...times(5, game(1, "loss", [91], [21])),
    ];
    const m = ownMatchups(games);
    expect(m.bestAllies).toMatchObject([{ heroId: 20, games: 5, winRate: 1, playedInto: [] }]);
    expect(m.worstAllies).toMatchObject([{ heroId: 21, games: 5, winRate: 0 }]);
    expect([...m.bestAllies, ...m.worstAllies].some((r) => r.heroId === 1)).toBe(false);
  });

  it("leaves games without lineups out of the sample, never guessing them", () => {
    const m = ownMatchups([
      ...times(5, game(1, "loss", null, null)),
      ...times(2, game(1, "win", [], [])),
      ...times(5, game(1, "win", [50])),
    ]);
    expect(m.games).toBe(12);
    expect(m.withLineups).toBe(5);
    expect(m.baseline).toEqual({ games: 5, wins: 5, winRate: 1 });
    expect(m.easiest.map((r) => r.heroId)).toEqual([50]);
  });

  it("returns empty lists and no baseline with no games", () => {
    expect(ownMatchups([])).toMatchObject({
      games: 0,
      withLineups: 0,
      baseline: null,
      toughest: [],
      easiest: [],
      bestAllies: [],
      worstAllies: [],
    });
  });

  it("honours minGames and limit", () => {
    const games = [10, 11, 12, 13].flatMap((id) => times(3, game(1, "loss", [id])));
    const m = ownMatchups(games, { minGames: 3, limit: 2 });
    expect(m.toughest.map((r) => r.heroId)).toEqual([10, 11]);
    expect(m.enemiesBelowMin).toBe(0);
  });
});

describe("lineupProgress", () => {
  it("reports progress while the backfill runs, and games with no lineup once done", () => {
    expect(lineupProgress({ total: 940, withLineups: 120, complete: false })).toEqual({
      total: 940,
      withLineups: 120,
      inProgress: true,
      missing: 0,
    });
    expect(lineupProgress({ total: 940, withLineups: 935, complete: true })).toEqual({
      total: 940,
      withLineups: 935,
      inProgress: false,
      missing: 5,
    });
  });
});
