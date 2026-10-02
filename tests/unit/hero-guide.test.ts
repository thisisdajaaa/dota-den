import { describe, expect, it } from "vitest";
import {
  formatBench,
  pickBenchmarks,
  proRecord,
  topItems,
  type ProGame,
} from "@/modules/guides/domain/hero-guide";

describe("topItems", () => {
  it("ranks a phase's items by purchases, relative to the most bought", () => {
    const res = topItems({ "16": 106, "44": 53, "13": 0, x: 9 }, () => false, 5);
    expect(res).toEqual([
      { itemId: 16, count: 106, relative: 1 },
      { itemId: 44, count: 53, relative: 0.5 },
    ]);
  });

  it("skips excluded items (e.g. consumables later in the game)", () => {
    expect(topItems({ "1": 10, "2": 5 }, (id) => id === 1).map((r) => r.itemId)).toEqual([2]);
  });
});

describe("pickBenchmarks", () => {
  it("takes the median, top 10% and top 1% of each stat it knows", () => {
    const res = pickBenchmarks({
      gold_per_min: [
        { percentile: 0.1, value: 250 },
        { percentile: 0.5, value: 383 },
        { percentile: 0.9, value: 550 },
        { percentile: 0.99, value: 716 },
      ],
      xp_per_min: [{ percentile: 0.5, value: 596 }],
      deaths_per_min: [{ percentile: 0.5, value: 0.2 }],
    });
    expect(res).toEqual([{ stat: "gold_per_min", median: 383, top10: 550, top1: 716 }]);
    expect(formatBench("last_hits_per_min", 5.169)).toBe("5.2");
    expect(formatBench("gold_per_min", 1234.4)).toBe("1,234");
  });
});

it("counts the pro record", () => {
  const g = (won: boolean) => ({ won }) as ProGame;
  expect(proRecord([g(true), g(false), g(true)])).toEqual({ games: 3, wins: 2 });
});

import { counters } from "@/modules/guides/domain/hero-guide";

describe("counters", () => {
  it("ranks opponents by a damped win rate and ignores small samples", () => {
    const res = counters([
      { heroId: 1, games: 100, wins: 65 },
      { heroId: 2, games: 10, wins: 9 }, // too few games
      { heroId: 3, games: 30, wins: 20 },
      { heroId: 4, games: 200, wins: 80 },
      { heroId: 5, games: 40, wins: 20 }, // even: neither list
    ]);
    expect(res.strongAgainst.map((c) => c.heroId)).toEqual([1, 3]);
    expect(res.strongAgainst[0]).toEqual({ heroId: 1, games: 100, wins: 65, rate: 0.65 });
    expect(res.weakAgainst.map((c) => c.heroId)).toEqual([4]);
  });
});
