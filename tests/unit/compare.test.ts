import { describe, expect, it } from "vitest";
import { parseCurves } from "@/common/providers/stratz-hero-curves";
import { CompareService } from "@/modules/heroes/compare.service";
import {
  bracketOf,
  compareToRank,
  nextBracket,
  theirsAt,
  type CompareGame,
  type CurvePoint,
} from "@/modules/heroes/domain/compare";

/** Players at the rank: 6 last hits, 0.5 kills + assists and 0.2 deaths a minute, to 35. */
const curve: CurvePoint[] = Array.from({ length: 36 }, (_, m) => ({
  minute: m,
  lastHits: 6 * m,
  fights: 0.5 * m,
  deaths: 0.2 * m,
}));

const game = (heroId: number, minutes: number, over: Partial<CompareGame> = {}): CompareGame => ({
  heroId,
  durationSec: minutes * 60,
  lastHits: 6 * minutes,
  kills: Math.round(0.25 * minutes),
  assists: Math.round(0.25 * minutes),
  deaths: Math.round(0.2 * minutes),
  ...over,
});

describe("ranks", () => {
  it("maps a rank medal to its bracket, and finds the one above", () => {
    expect(bracketOf(15)).toBe("HERALD_GUARDIAN");
    expect(bracketOf(42)).toBe("CRUSADER_ARCHON");
    expect(bracketOf(55)).toBe("LEGEND_ANCIENT");
    expect(bracketOf(74)).toBe("DIVINE_IMMORTAL");
    expect(bracketOf(80)).toBe("DIVINE_IMMORTAL");
    expect(bracketOf(null)).toBeNull();
    expect(nextBracket("CRUSADER_ARCHON")).toBe("LEGEND_ANCIENT");
    expect(nextBracket("DIVINE_IMMORTAL")).toBe("DIVINE_IMMORTAL");
  });
});

describe("theirsAt", () => {
  it("reads the rank's value at the same minute, and stretches past the curve's end", () => {
    expect(theirsAt(curve, 20, "lastHits")).toBe(120);
    expect(theirsAt(curve, 20.4, "lastHits")).toBe(120);
    // 42 minutes: the 35-minute value scaled by 42/35.
    expect(theirsAt(curve, 42, "lastHits")).toBeCloseTo(252, 5);
    expect(theirsAt([], 20, "lastHits")).toBeNull();
  });
});

describe("compareToRank", () => {
  it("sets each game against the rank at that game's length", () => {
    // Same farm as the rank at every length, 20% fewer deaths on hero 1.
    const games = [20, 30, 40, 25, 35].map((m) => game(1, m, { deaths: Math.round(0.16 * m) }));
    const res = compareToRank(games, new Map([[1, curve]]));
    const stats = Object.fromEntries(res.heroes[0].stats.map((s) => [s.stat, s]));
    expect(stats.lastHits.diffPct).toBe(0);
    expect(stats.deaths.diffPct).toBeLessThan(-15);
    expect(stats.deaths.better).toBe(true);
    expect(res.strongest).toMatchObject({ heroId: 1, stat: { stat: "deaths" } });
  });

  it("finds the biggest shortfall, and skips short games and heroes with few games", () => {
    const games = [
      ...[25, 30, 35, 28, 32].map((m) => game(1, m, { lastHits: Math.round(4.5 * m) })),
      ...[25, 30, 35, 28, 32].map((m) => game(2, m)),
      game(3, 30),
      game(1, 10, { lastHits: 0 }),
    ];
    const res = compareToRank(
      games,
      new Map([
        [1, curve],
        [2, curve],
        [3, curve],
      ]),
    );
    expect(res.heroes.map((h) => h.heroId)).toEqual([1, 2]);
    expect(res.weakest).toMatchObject({
      heroId: 1,
      stat: { stat: "lastHits", diffPct: -25, better: false },
    });
  });
});

describe("parseCurves", () => {
  it("reads one curve per hero and rejects errors", () => {
    const body = {
      data: {
        heroStats: {
          h2: [{ time: 10, matchCount: 100, cs: 50, kills: 2, assists: 3, deaths: 1 }],
        },
      },
    };
    expect(parseCurves(body, [2])?.get(2)).toEqual([
      { minute: 10, games: 100, lastHits: 50, fights: 5, deaths: 1 },
    ]);
    expect(parseCurves({ ...body, errors: [{}] }, [2])).toBeNull();
    expect(parseCurves(body, [2, 3])).toBeNull();
  });
});

describe("CompareService", () => {
  const games = [1, 2, 3].flatMap((h) => [25, 30, 35, 28, 32].map((m) => game(h, m)));
  const service = (plus: boolean, tier: number | null = 74) =>
    new CompareService({
      games: async () => games,
      rankTier: async () => tier,
      curves: async (ids) => new Map(ids.map((id) => [id, curve])),
      isPlus: async () => plus,
    });

  it("shows Plus every hero and everyone else the most played one", async () => {
    const plus = await service(true).compare({ id: "u", accountId32: 1 });
    expect(plus).toMatchObject({ status: "ok", bracket: "DIVINE_IMMORTAL", locked: 0 });
    expect(plus.heroes).toHaveLength(3);
    const free = await service(false).compare({ id: "u", accountId32: 1 });
    expect(free.heroes).toHaveLength(1);
    expect(free.locked).toBe(2);
  });

  it("compares with the rank above on request, and needs a rank", async () => {
    const up = await service(true, 42).compare({ id: "u", accountId32: 1 }, "next");
    expect(up).toMatchObject({ yourBracket: "CRUSADER_ARCHON", bracket: "LEGEND_ANCIENT" });
    expect((await service(true, null).compare({ id: "u", accountId32: 1 })).status).toBe(
      "unranked",
    );
  });
});
