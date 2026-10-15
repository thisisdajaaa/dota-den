import { describe, expect, it } from "vitest";
import {
  heroCoaching,
  itemImpact,
  median,
  type CoachingGame,
} from "@/modules/heroes/domain/hero-coaching";

const isItem = (key: string) => key !== "tango";

describe("itemImpact", () => {
  it("compares win rates with and without each item, only over games with purchase data", () => {
    const games = [
      // 6 games with BKB: 5 wins. 6 without: 2 wins. Manta in 3 games only.
      ...Array.from({ length: 6 }, (_, i) => ({
        purchase: { black_king_bar: 1, tango: 3, ...(i < 3 ? { manta: 1 } : {}) },
        won: i < 5,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({ purchase: { tango: 2 }, won: i < 2 })),
      // No purchase data, or no result: never counted.
      { purchase: null, won: true },
      { purchase: { black_king_bar: 1 }, won: null },
    ];
    const view = itemImpact(games, isItem);
    expect(view.withData).toBe(12);
    expect(view.rows).toHaveLength(1);
    const [bkb] = view.rows;
    expect(bkb.key).toBe("black_king_bar");
    expect(bkb.bought).toEqual({ games: 6, wins: 5, winRate: 5 / 6 });
    expect(bkb.skipped).toEqual({ games: 6, wins: 2, winRate: 2 / 6 });
    expect(bkb.delta).toBeCloseTo(0.5);
  });

  it("leaves out items bought in nearly every game (nothing to compare against)", () => {
    const games = Array.from({ length: 12 }, (_, i) => ({
      purchase: { bfury: 1, ...(i < 6 ? { manta: 1 } : {}) },
      won: i % 2 === 0,
    }));
    expect(itemImpact(games, isItem).rows.map((r) => r.key)).toEqual(["manta"]);
  });

  it("puts the best items first after keeping the biggest differences", () => {
    const games = Array.from({ length: 20 }, (_, i) => ({
      purchase: { a: i < 10 ? 1 : 0, b: i % 2 === 0 ? 1 : 0, c: i >= 10 ? 1 : 0 },
      won: i < 8,
    }));
    const rows = itemImpact(games, isItem, { limit: 2 }).rows;
    expect(rows.map((r) => r.key)).toEqual(["a", "c"]);
    expect(rows[0].delta).toBeGreaterThan(0);
    expect(rows[1].delta).toBeLessThan(0);
  });
});

describe("heroCoaching", () => {
  const game = (over: Partial<CoachingGame>): CoachingGame => ({
    result: "win",
    laneRole: 1,
    roaming: false,
    efficiencyPct: 70,
    laneResult: "won",
    itemTimings: [],
    ...over,
  });

  it("shows nothing below the minimum, but still reports progress", () => {
    const c = heroCoaching([game({}), game({})], 30, isItem);
    expect(c).toMatchObject({ analysed: 2, parsedGames: 30, enough: false, timings: [] });
  });

  it("takes median timings in wins and losses, hiding a side with too few games", () => {
    const games = [
      ...[600, 700, 800, 900].map((t) =>
        game({ result: "win", itemTimings: [{ key: "bfury", time: t }] }),
      ),
      ...[1000, 1100].map((t) =>
        game({
          result: "loss",
          itemTimings: [
            { key: "bfury", time: t },
            { key: "tango", time: -80 },
          ],
        }),
      ),
      game({ result: "loss", itemTimings: [] }),
      game({ result: "loss", itemTimings: [{ key: "manta", time: 1500 }] }),
    ];
    const c = heroCoaching(games, 8, isItem);
    expect(c.enough).toBe(true);
    expect(c.timings).toEqual([
      {
        key: "bfury",
        games: 6,
        wins: { games: 4, median: 750 },
        losses: { games: 2, median: null },
      },
    ]);
  });

  it("groups lane results by role, with game record and median efficiency", () => {
    const games = [
      ...Array.from({ length: 5 }, (_, i) =>
        game({
          laneRole: 1,
          result: i < 3 ? "win" : "loss",
          laneResult: i < 2 ? "won" : "lost",
          efficiencyPct: 60 + i * 5,
        }),
      ),
      game({ laneRole: 3, laneResult: null, efficiencyPct: null, roaming: true }),
      game({ laneRole: 4, laneResult: null, efficiencyPct: 40 }),
      game({ laneRole: null, laneResult: null }),
    ];
    const c = heroCoaching(games, 8, isItem);
    expect(c.lanes).toEqual([
      {
        laneRole: 1,
        games: 5,
        wins: 3,
        lane: { compared: 5, won: 2, even: 0, lost: 3 },
        efficiency: { median: 70, games: 5 },
      },
      {
        laneRole: 3,
        games: 1,
        wins: 1,
        lane: { compared: 0, won: 0, even: 0, lost: 0 },
        efficiency: null,
      },
      {
        laneRole: 4,
        games: 1,
        wins: 1,
        lane: { compared: 0, won: 0, even: 0, lost: 0 },
        efficiency: { median: 40, games: 1 },
      },
    ]);
    expect(c.noLaneRole).toBe(1);
  });

  it("takes medians of odd and even samples", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
