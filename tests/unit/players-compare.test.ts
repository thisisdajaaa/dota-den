import { describe, expect, it } from "vitest";
import { headToHead, playerSummary, sharedHeroes } from "@/modules/players/domain/compare";

const hero = (heroId: number, games: number, wins: number) => ({
  heroId,
  games,
  wins,
  lastPlayedAt: null,
});
const match = (win: boolean, k: number, d: number, a: number) => ({
  result: (win ? "win" : "loss") as "win" | "loss",
  kills: k,
  deaths: d,
  assists: a,
});

describe("playerSummary", () => {
  it("summarises record, recent form, KDA and the most-played hero", () => {
    const s = playerSummary({
      record: { wins: 60, losses: 40 },
      heroes: [hero(1, 10, 6), hero(2, 30, 12)],
      matches: [match(true, 10, 2, 5), match(false, 2, 8, 4)],
    });
    expect(s.record).toEqual({ games: 100, wins: 60 });
    expect(s.recent).toEqual({ games: 2, wins: 1 });
    expect(s.kda).toBeCloseTo(21 / 10);
    expect(s.topHero?.heroId).toBe(2);
  });

  it("doesn't invent numbers when data is missing", () => {
    expect(playerSummary({ record: null, heroes: null, matches: null })).toEqual({
      record: null,
      recent: { games: 0, wins: 0 },
      kda: null,
      topHero: null,
    });
  });
});

describe("sharedHeroes", () => {
  it("keeps heroes both played enough, most played first", () => {
    const res = sharedHeroes(
      [hero(1, 5, 3), hero(2, 20, 10), hero(3, 2, 2)],
      [hero(1, 4, 1), hero(2, 3, 3), hero(3, 9, 5)],
    );
    expect(res.map((h) => h.heroId)).toEqual([2, 1]);
    expect(res[0]).toEqual({ heroId: 2, a: { games: 20, wins: 10 }, b: { games: 3, wins: 3 } });
  });
});

describe("headToHead", () => {
  const peer = {
    accountId32: 7,
    personaName: "B",
    avatarUrl: null,
    withGames: 12,
    withWins: 8,
    againstGames: 3,
    againstWins: 1,
    lastPlayedAt: null,
  };

  it("reads the first player's record with and against the second", () => {
    expect(headToHead([peer], 7)).toEqual({
      together: { games: 12, wins: 8 },
      against: { games: 3, wins: 1 },
    });
    expect(headToHead([peer], 8)).toBeNull();
  });
});
