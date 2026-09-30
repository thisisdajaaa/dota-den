import { describe, expect, it } from "vitest";
import {
  betterThan,
  performanceHighlights,
  performanceLines,
} from "@/modules/matches/domain/match-performance";

describe("match performance", () => {
  it("lists the stats in order, clamped, and skips healing for non-healers", () => {
    const lines = performanceLines({
      tower_damage: { raw: 300, pct: 0.12, pctBracket: null },
      gold_per_min: { raw: 612, pct: 1.2, pctBracket: 0.7 },
      hero_healing_per_min: { raw: 0, pct: 0.5, pctBracket: null },
    });
    expect(lines.map((l) => l.stat)).toEqual(["gold_per_min", "tower_damage"]);
    expect(lines[0].pct).toBe(1);
    expect(performanceLines(null)).toEqual([]);
  });

  it("names a strength and a weakness only when they stand out", () => {
    const line = (stat: "gold_per_min" | "xp_per_min", pct: number) => ({
      stat,
      raw: 1,
      pct,
      pctBracket: null,
    });
    expect(performanceHighlights([line("gold_per_min", 0.9), line("xp_per_min", 0.2)])).toEqual({
      best: line("gold_per_min", 0.9),
      worst: line("xp_per_min", 0.2),
    });
    expect(performanceHighlights([line("gold_per_min", 0.55), line("xp_per_min", 0.45)])).toEqual({
      best: null,
      worst: null,
    });
    expect(betterThan(0.834)).toBe("better than 83%");
    expect(betterThan(1)).toBe("better than 99%+");
  });
});
