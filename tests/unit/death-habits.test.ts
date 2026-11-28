import { describe, expect, it } from "vitest";
import { deathHabits, type DeathGame } from "@/modules/heroes/domain/death-habits";

const game = (
  result: DeathGame["result"],
  byHeroes: Array<[time: number, killer: number]>,
  other = 0,
  durationSec = 2400,
): DeathGame => ({
  heroId: 1,
  result,
  deaths: {
    durationSec,
    byHeroes: byHeroes.map(([time, killerHeroId]) => ({ time, killerHeroId })),
    other,
  },
});

describe("deathHabits", () => {
  it("is empty without games", () => {
    const h = deathHabits([]);
    expect(h).toMatchObject({
      games: 0,
      perGame: null,
      heroShare: null,
      laningPerGame: null,
      firstDeathSec: null,
      killers: [],
    });
    expect(h.byPhase.every((p) => p.per10 === null)).toBe(true);
  });

  it("counts deaths per game, by phase and by killer", () => {
    const games = [
      game(
        "loss",
        [
          [200, 2],
          [500, 2],
          [1500, 3],
        ],
        1,
        1800,
      ),
      game(
        "loss",
        [
          [300, 2],
          [2000, 4],
        ],
        0,
        2400,
      ),
      game("win", [[900, 3]], 1, 1200),
      game("win", [], 0, 1500),
      game("win", [[1300, 2]], 0, 2000),
    ];
    const h = deathHabits(games);
    expect(h.games).toBe(5);
    expect(h.perGame).toBeCloseTo(9 / 5);
    expect(h.heroShare).toBeCloseTo(7 / 9);
    expect(h.laningPerGame).toBeCloseTo(3 / 5);
    // First hero deaths: 200, 300, 900, 1300 → median 600.
    expect(h.firstDeathSec).toBe(600);
    // Games with no hero death before 10:00: 3 of 5.
    expect(h.cleanLaningShare).toBeCloseTo(3 / 5);
    // Only time played counts: 20:00–30:00 was played for 2,100 s, past 30:00 for 800 s.
    expect(h.byPhase).toEqual([
      { phase: "laning", deaths: 3, per10: 0.6 },
      { phase: "early", deaths: 1, per10: 0.2 },
      { phase: "mid", deaths: 2, per10: 1200 / 2100 },
      { phase: "late", deaths: 1, per10: 0.75 },
    ]);
    expect(h.wins).toEqual({ games: 3, perGame: null });
    expect(h.killers).toEqual([
      { heroId: 2, kills: 4, games: 3 },
      { heroId: 3, kills: 2, games: 2 },
      { heroId: 4, kills: 1, games: 1 },
    ]);
  });

  it("splits wins and losses once each has enough games, and skips phases nobody reached", () => {
    const games = [
      ...Array.from({ length: 5 }, () => game("win", [[700, 2]], 0, 1500)),
      ...Array.from({ length: 5 }, () =>
        game(
          "loss",
          [
            [700, 2],
            [800, 2],
          ],
          2,
          1500,
        ),
      ),
    ];
    const h = deathHabits(games);
    expect(h.wins).toEqual({ games: 5, perGame: 1 });
    expect(h.losses).toEqual({ games: 5, perGame: 4 });
    expect(h.byPhase.find((p) => p.phase === "late")?.per10).toBeNull();
    expect(h.byPhase.find((p) => p.phase === "mid")?.per10).toBe(0);
  });
});
