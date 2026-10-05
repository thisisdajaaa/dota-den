import { describe, expect, it } from "vitest";
import { battleReport, type ReportGame } from "@/modules/report/domain/battle-report";

let n = 0;
const g = (won: boolean, over: Partial<ReportGame> = {}): ReportGame => ({
  matchId: String(++n),
  startedAt: new Date(Date.UTC(2026, 8, 1) + n * 3_600_000),
  durationSec: 2_400,
  heroId: 1,
  side: "radiant",
  won,
  kills: 5,
  deaths: 5,
  assists: 5,
  goldPerMin: 500,
  xpPerMin: 600,
  lastHits: 200,
  denies: 10,
  heroDamage: 20_000,
  heroHealing: 0,
  towerDamage: 1_000,
  laneRole: null,
  ...over,
});
const utc = (d: Date) => d.toISOString().slice(0, 10);

describe("battleReport", () => {
  it("counts games, streaks, sides, heroes and days", () => {
    const r = battleReport(
      [
        g(true),
        g(true),
        g(true),
        g(false, { side: "dire", heroId: 2 }),
        g(false, { side: "dire" }),
        g(true, { heroId: 2, durationSec: 1_200 }),
      ],
      utc,
    );
    expect(r).toMatchObject({
      games: 6,
      wins: 4,
      heroesPlayed: 2,
      maxWinStreak: 3,
      maxLossStreak: 2,
    });
    expect(r.sides).toEqual({ radiant: { games: 4, wins: 4 }, dire: { games: 2, wins: 0 } });
    expect(r.avgDurationSec).toBe(2_200);
    expect(r.heroes.map((h) => [h.heroId, h.games, h.wins])).toEqual([
      [1, 4, 3],
      [2, 2, 1],
    ]);
    expect([...r.days.values()].reduce((s, d) => s + d.games, 0)).toBe(6);
  });

  it("keeps the best game per stat with its match, skipping missing values", () => {
    const r = battleReport(
      [
        g(false, { matchId: "a", heroDamage: 50_000, goldPerMin: null }),
        g(true, { matchId: "b", heroDamage: 30_000, goldPerMin: 700 }),
      ],
      utc,
    );
    const rec = (s: string) => r.records.find((x) => x.stat === s)!;
    expect(rec("heroDamage")).toMatchObject({ value: 50_000, matchId: "a", won: false });
    expect(rec("goldPerMin")).toMatchObject({ value: 700, matchId: "b", won: true });
  });

  it("counts roles from games with replay lane data only", () => {
    const r = battleReport([g(true, { laneRole: 1 }), g(false, { laneRole: 2 }), g(true)], utc);
    expect(r.roles).toEqual({
      withData: 2,
      byRole: [
        { role: 1, games: 1, wins: 1 },
        { role: 2, games: 1, wins: 0 },
      ],
    });
  });
});
