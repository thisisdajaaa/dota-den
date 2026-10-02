import { describe, expect, it } from "vitest";
import { heroProgress, type ProgressGame } from "@/modules/heroes/domain/hero-progress";

const game = (i: number, over: Partial<ProgressGame> = {}): ProgressGame => ({
  startedAt: new Date(Date.UTC(2026, 8, 1) + i * 86_400_000),
  durationSec: 1_800,
  won: i % 2 === 0,
  goldPerMin: 400 + i * 10,
  xpPerMin: 500,
  lastHits: 150,
  kills: 5,
  deaths: 5,
  assists: 5,
  ...over,
});

describe("heroProgress", () => {
  it("compares the earlier half of recent games with the latest half", () => {
    const p = heroProgress(Array.from({ length: 20 }, (_, i) => game(i)))!;
    expect(p).toMatchObject({ games: 20, half: 10 });
    const gpm = p.stats.find((s) => s.stat === "gpm")!;
    // Games 0–9 average 445, games 10–19 average 545.
    expect(gpm.earlier).toBe(445);
    expect(gpm.latest).toBe(545);
    expect(gpm.change).toBe(100);
    expect(gpm.series).toHaveLength(20);
    const lhpm = p.stats.find((s) => s.stat === "lhpm")!;
    expect(lhpm.latest).toBeCloseTo(5);
    expect(p.stats.find((s) => s.stat === "kda")!.latest).toBe(2);
  });

  it("uses at most the last 30 games, and needs at least 10", () => {
    expect(heroProgress(Array.from({ length: 9 }, (_, i) => game(i)))).toBeNull();
    expect(heroProgress(Array.from({ length: 50 }, (_, i) => game(i)))!.games).toBe(30);
  });

  it("drops a stat most games don't have", () => {
    const p = heroProgress(Array.from({ length: 12 }, (_, i) => game(i, { goldPerMin: null })))!;
    expect(p.stats.map((s) => s.stat)).not.toContain("gpm");
  });
});
