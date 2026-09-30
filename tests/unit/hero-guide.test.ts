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
