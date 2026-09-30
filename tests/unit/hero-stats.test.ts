import { describe, expect, it } from "vitest";
import {
  averageOf,
  heroIndex,
  heroRecord,
  highRankComparison,
  isNotableItem,
  itemPurchases,
  matchups,
  monthKey,
  winRateTrend,
  winRecord,
  type HeroGame,
  type MatchupRow,
} from "@/modules/heroes/domain/hero-stats";

let seq = 0;
function game(overrides: Partial<HeroGame> = {}): HeroGame {
  seq++;
  return {
    matchId: String(seq),
    heroId: 1,
    startedAt: new Date("2026-09-01T12:00:00Z"),
    result: "win",
    kills: 5,
    deaths: 2,
    assists: 10,
    patch: "7.41",
    ...overrides,
  };
}

describe("winRecord", () => {
  it("never makes up a win rate without games", () => {
    expect(winRecord([])).toEqual({ games: 0, wins: 0, losses: 0, winRate: null, lowSample: true });
  });
  it("flags small samples", () => {
    expect(winRecord(["win", "loss", "win"]).lowSample).toBe(true);
    expect(winRecord(Array(10).fill("win")).lowSample).toBe(false);
  });
});

describe("heroRecord", () => {
  it("sums KDA over games and finds the last game", () => {
    const r = heroRecord([
      game({ kills: 10, deaths: 0, assists: 5, startedAt: new Date("2026-09-02T00:00:00Z") }),
      game({ kills: 2, deaths: 4, assists: 3, result: "loss" }),
    ]);
    expect(r.games).toBe(2);
    expect(r.wins).toBe(1);
    expect(r.winRate).toBe(0.5);
    expect(r.kda).toBeCloseTo((12 + 8) / 4);
    expect(r.averages).toEqual({ kills: 6, deaths: 2, assists: 4 });
    expect(r.lastPlayed).toEqual(new Date("2026-09-02T00:00:00Z"));
  });

  it("has no KDA or averages without games", () => {
    const r = heroRecord([]);
    expect(r.kda).toBeNull();
    expect(r.averages).toBeNull();
    expect(r.lastPlayed).toBeNull();
  });

  it("divides by one death when there are none", () => {
    expect(heroRecord([game({ kills: 3, deaths: 0, assists: 4 })]).kda).toBe(7);
  });
});

describe("heroIndex", () => {
  it("lists every hero, most played first, then most recent", () => {
    const rows = heroIndex([
      game({ heroId: 2, startedAt: new Date("2026-09-01") }),
      game({ heroId: 3, startedAt: new Date("2026-09-05") }),
      game({ heroId: 1 }),
      game({ heroId: 1 }),
    ]);
    expect(rows.map((r) => [r.heroId, r.games])).toEqual([
      [1, 2],
      [3, 1],
      [2, 1],
    ]);
  });
});

describe("winRateTrend", () => {
  const at = (iso: string, patch: string | null, result: "win" | "loss" = "win") =>
    game({ startedAt: new Date(iso), patch, result });

  it("splits by patch when most games have one and they span two patches", () => {
    const t = winRateTrend(
      [
        at("2026-08-01T00:00:00Z", "7.40"),
        at("2026-08-02T00:00:00Z", "7.40", "loss"),
        at("2026-09-10T00:00:00Z", "7.41"),
        at("2026-09-11T00:00:00Z", "7.41"),
        at("2026-09-12T00:00:00Z", "7.41"),
      ],
      { timeZone: "UTC" },
    );
    expect(t.by).toBe("patch");
    expect(t.buckets.map((b) => [b.label, b.games, b.wins])).toEqual([
      ["7.40", 2, 1],
      ["7.41", 3, 3],
    ]);
    expect(t.unassigned).toBe(0);
  });

  it("counts games with no patch separately in a patch trend", () => {
    const games = [
      ...Array.from({ length: 5 }, (_, i) => at(`2026-08-0${i + 1}T00:00:00Z`, "7.40")),
      ...Array.from({ length: 4 }, (_, i) => at(`2026-09-0${i + 1}T00:00:00Z`, "7.41")),
      at("2026-09-09T00:00:00Z", null),
    ];
    const t = winRateTrend(games, { timeZone: "UTC" });
    expect(t.by).toBe("patch");
    expect(t.unassigned).toBe(1);
    expect(t.buckets.reduce((n, b) => n + b.games, 0)).toBe(9);
  });

  it("falls back to months when all games are in one patch", () => {
    const t = winRateTrend(
      [at("2026-08-31T12:00:00Z", "7.41"), at("2026-09-01T12:00:00Z", "7.41", "loss")],
      { timeZone: "UTC" },
    );
    expect(t.by).toBe("month");
    expect(t.buckets.map((b) => [b.key, b.label, b.games])).toEqual([
      ["2026-08", "Aug 2026", 1],
      ["2026-09", "Sep 2026", 1],
    ]);
  });

  it("falls back to months when too few games have a patch", () => {
    const t = winRateTrend(
      [
        at("2026-08-01T00:00:00Z", "7.40"),
        at("2026-09-01T00:00:00Z", "7.41"),
        at("2026-09-02T00:00:00Z", null),
      ],
      { timeZone: "UTC" },
    );
    expect(t.by).toBe("month");
    expect(t.unassigned).toBe(0);
  });

  it("keeps only the most recent buckets and counts the older games", () => {
    const games = ["01", "02", "03", "04"].map((m) => at(`2026-${m}-15T00:00:00Z`, null));
    const t = winRateTrend(games, { timeZone: "UTC", maxBuckets: 2 });
    expect(t.buckets.map((b) => b.key)).toEqual(["2026-03", "2026-04"]);
    expect(t.older).toBe(2);
  });

  it("uses the viewer's time zone for months", () => {
    const d = new Date("2026-09-01T02:00:00Z");
    expect(monthKey(d, "UTC")).toBe("2026-09");
    expect(monthKey(d, "America/New_York")).toBe("2026-08");
    expect(monthKey(d, "Not/AZone")).toBe("2026-09");
  });

  it("is empty with no games", () => {
    expect(winRateTrend([], { timeZone: "UTC" })).toEqual({
      by: "month",
      buckets: [],
      unassigned: 0,
      older: 0,
    });
  });
});

describe("matchups", () => {
  const row = (heroId: number, against: [number, number], withh: [number, number] = [0, 0]) =>
    ({
      heroId,
      againstGames: against[0],
      againstWins: against[1],
      withGames: withh[0],
      withWins: withh[1],
    }) satisfies MatchupRow;

  it("splits enemies into beats and loses-to, leaving out small samples", () => {
    const m = matchups(
      [
        row(1, [0, 0]),
        row(2, [10, 8], [6, 5]),
        row(3, [5, 1], [3, 3]),
        row(4, [4, 4]),
        row(5, [8, 4], [9, 2]),
        row(6, [6, 1]),
      ],
      1,
    );
    expect(m.beats.map((e) => e.heroId)).toEqual([2, 5]);
    expect(m.losesTo.map((e) => e.heroId)).toEqual([6, 3]);
    expect(m.allies.map((e) => [e.heroId, e.winRate])).toEqual([[2, 5 / 6]]);
    expect(m.enemiesBelowMin).toBe(1);
    expect(m.alliesBelowMin).toBe(1);
  });

  it("never lists the hero itself and ignores impossible rows", () => {
    const m = matchups([row(1, [20, 10], [20, 10]), row(7, [5, 9])], 1);
    expect(m.beats).toEqual([]);
    expect(m.losesTo).toEqual([]);
    expect(m.allies).toEqual([]);
  });

  it("caps each list", () => {
    const rows = Array.from({ length: 9 }, (_, i) => row(10 + i, [10, 9]));
    expect(matchups(rows, 1, { limit: 3 }).beats).toHaveLength(3);
  });
});

describe("items", () => {
  it("keeps finished items and leaves out recipes, consumables and cheap components", () => {
    expect(isNotableItem({ key: "black_king_bar", qual: "epic", cost: 4050 })).toBe(true);
    expect(isNotableItem({ key: "blink", qual: "component", cost: 2250 })).toBe(true);
    expect(isNotableItem({ key: "boots", qual: "component", cost: 500 })).toBe(false);
    expect(isNotableItem({ key: "tango", qual: "consumable", cost: 90 })).toBe(false);
    expect(isNotableItem({ key: "recipe_force_staff", qual: null, cost: 950 })).toBe(false);
    expect(isNotableItem({ key: "bottle", qual: "common", cost: 675 })).toBe(true);
  });

  const notable = (k: string) => ["bkb", "blink", "manta"].includes(k);

  it("counts each game once per item, over games with purchase data", () => {
    const s = itemPurchases(
      [
        { purchase: { bkb: 1, tango: 3 } },
        { purchase: { bkb: 2, blink: 1 } },
        { purchase: { blink: 1, manta: 0 } },
        { purchase: { bkb: 1 } },
        { purchase: {} },
        { purchase: null },
      ],
      notable,
    );
    expect(s.sample).toBe(6);
    expect(s.withData).toBe(5);
    expect(s.enough).toBe(true);
    expect(s.items).toEqual([
      { key: "bkb", games: 3, share: 3 / 5 },
      { key: "blink", games: 2, share: 2 / 5 },
    ]);
  });

  it("lists nothing under the minimum sample", () => {
    const s = itemPurchases([{ purchase: { bkb: 1 } }, { purchase: null }], notable);
    expect(s).toEqual({ sample: 2, withData: 1, enough: false, items: [] });
  });
});

describe("averageOf", () => {
  it("averages known values only", () => {
    expect(averageOf([500, null, 700])).toEqual({ average: 600, games: 2 });
    expect(averageOf([null])).toBeNull();
  });
});

describe("highRankComparison", () => {
  it("compares only when your sample is big enough", () => {
    const big = winRecord([...Array(6).fill("win"), ...Array(4).fill("loss")]);
    const c = highRankComparison(big, { games: 1000, wins: 480 });
    expect(c?.publicRate).toBe(0.48);
    expect(c?.delta).toBeCloseTo(0.12);
    expect(highRankComparison(winRecord(["win"]), { games: 1000, wins: 480 })?.delta).toBeNull();
  });

  it("is null without usable public data", () => {
    expect(highRankComparison(winRecord([]), null)).toBeNull();
    expect(highRankComparison(winRecord([]), { games: 0, wins: 0 })).toBeNull();
    expect(highRankComparison(winRecord([]), { games: 5, wins: 9 })).toBeNull();
  });
});
