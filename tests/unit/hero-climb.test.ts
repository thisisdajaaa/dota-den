import { describe, expect, it } from "vitest";
import { climbByHero, type HeroRankedResult } from "@/modules/mmr/domain/hero-climb";

const at = (h: number) => new Date(Date.UTC(2026, 8, 1, h));
const game = (
  h: number,
  heroId: number,
  result: "win" | "loss",
  queueClass: "solo" | "party" | "unknown" = "solo",
): HeroRankedResult => ({
  startedAt: at(h),
  heroId,
  result,
  queueClass,
});
const loaded = { from: at(0), to: at(23) };
const always = () => true;

describe("climbByHero", () => {
  it("estimates each hero's climb from wins and losses, most played first", () => {
    const res = climbByHero({
      observations: [],
      matches: [game(1, 1, "win"), game(2, 2, "loss"), game(3, 1, "win"), game(4, 1, "loss")],
      scope: "all",
      loaded,
      inPeriod: always,
    });
    expect(res.map((h) => [h.heroId, h.wins, h.losses, h.estimatedNet])).toEqual([
      [1, 2, 1, 25],
      [2, 0, 1, -25],
    ]);
    expect(res[0].path).toEqual([25, 50, 25]);
    expect(res[0].exact).toBeNull();
  });

  it("is exact only when a span between entries holds games on one hero", () => {
    const res = climbByHero({
      observations: [
        { observedAt: at(0), mmr: 5000 },
        { observedAt: at(5), mmr: 5061 }, // games 1-2: hero 1 only
        { observedAt: at(10), mmr: 5040 }, // games 6-7: mixed heroes
      ],
      matches: [game(1, 1, "win"), game(2, 1, "win"), game(6, 1, "loss"), game(7, 2, "loss")],
      scope: "all",
      loaded,
      inPeriod: always,
    });
    expect(res.find((h) => h.heroId === 1)?.exact).toEqual({ delta: 61, games: 2 });
    expect(res.find((h) => h.heroId === 2)?.exact).toBeNull();
  });

  it("doesn't claim exact spans that reach outside the loaded games or the scope", () => {
    const observations = [
      { observedAt: at(0), mmr: 5000 },
      { observedAt: at(5), mmr: 5050 },
    ];
    const matches = [game(1, 1, "win"), game(2, 1, "win", "party")];
    const outside = climbByHero({
      observations,
      matches,
      scope: "all",
      loaded: { from: at(1), to: at(23) },
      inPeriod: always,
    });
    expect(outside[0].exact).toBeNull();
    const solo = climbByHero({ observations, matches, scope: "solo", loaded, inPeriod: always });
    expect(solo[0]).toMatchObject({ games: 1, exact: null });
  });

  it("only counts games inside the period", () => {
    const res = climbByHero({
      observations: [],
      matches: [game(1, 1, "win"), game(12, 1, "win")],
      scope: "all",
      loaded,
      inPeriod: (d) => d < at(10),
    });
    expect(res[0].games).toBe(1);
  });
});
