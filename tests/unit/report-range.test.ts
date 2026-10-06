import { describe, expect, it } from "vitest";
import {
  avgOf,
  battleReport,
  periodTotals,
  type ReportGame,
} from "@/modules/report/domain/battle-report";
import { parseReportRange, previousRange } from "@/modules/report/domain/report-range";

const today = "2026-10-06";

describe("report range", () => {
  it("uses presets, with 90 days as the default", () => {
    expect(parseReportRange({}, today)).toEqual({
      from: "2026-07-09",
      to: today,
      length: 90,
      preset: 90,
    });
    expect(parseReportRange({ days: "30" }, today)).toMatchObject({
      from: "2026-09-07",
      preset: 30,
    });
    expect(parseReportRange({ days: "45" }, today).preset).toBe(90);
  });

  it("accepts a custom range up to a year, within the last two years", () => {
    expect(parseReportRange({ from: "2026-09-01", to: "2026-09-30" }, today)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
      length: 30,
      preset: null,
    });
    // Backwards, in the future, too long, too old or not a date: the default preset.
    for (const bad of [
      { from: "2026-09-30", to: "2026-09-01" },
      { from: "2026-10-01", to: "2026-10-09" },
      { from: "2025-01-01", to: "2026-09-01" },
      { from: "2024-01-01", to: "2024-02-01" },
      { from: "2026-02-30", to: "2026-03-01" },
    ])
      expect(parseReportRange(bad, today).preset).toBe(90);
  });

  it("compares with the period of the same length just before", () => {
    const r = parseReportRange({ from: "2026-09-01", to: "2026-09-30" }, today);
    expect(previousRange(r)).toEqual({ from: "2026-08-02", to: "2026-08-31" });
  });
});

let n = 0;
const g = (won: boolean, over: Partial<ReportGame> = {}): ReportGame => ({
  matchId: String(++n),
  startedAt: new Date(Date.UTC(2026, 8, 1) + n * 3_600_000),
  durationSec: 2_000,
  heroId: 1,
  side: "radiant",
  won,
  kills: 4,
  deaths: 2,
  assists: 6,
  goldPerMin: 500,
  xpPerMin: 600,
  lastHits: null,
  denies: null,
  heroDamage: null,
  heroHealing: null,
  towerDamage: null,
  laneRole: null,
  parsed: false,
  ...over,
});

describe("period totals and hero averages", () => {
  it("sums KDA over the period and averages GPM only where reported", () => {
    const t = periodTotals([g(true), g(false, { goldPerMin: null, deaths: 6 })]);
    expect(t).toMatchObject({ games: 2, winRate: 0.5, gpm: 500 });
    expect(t.kda).toBeCloseTo((4 + 6 + 4 + 6) / 8);
    expect(periodTotals([])).toEqual({ games: 0, winRate: null, kda: null, gpm: null });
  });

  it("keeps GPM/XPM averages per hero", () => {
    const r = battleReport(
      [g(true, { goldPerMin: 400 }), g(false, { goldPerMin: 600, xpPerMin: null })],
      (d) => d.toISOString().slice(0, 10),
    );
    expect(avgOf(r.heroes[0].gpm)).toBe(500);
    expect(avgOf(r.heroes[0].xpm)).toBe(600);
    expect(avgOf({ sum: 0, games: 0 })).toBeNull();
  });
});
