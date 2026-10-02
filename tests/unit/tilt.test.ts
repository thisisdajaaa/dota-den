import { describe, expect, it } from "vitest";
import type { SessionMatch } from "@/modules/sessions/domain/session";
import { currentLossStreak, tiltStats, tiltWarning } from "@/modules/sessions/domain/tilt";

let n = 0;
/** A ranked game at `minutes` past a fixed start, 30 minutes long. */
const g = (minutes: number, result: "win" | "loss", ranked = true): SessionMatch => ({
  matchId: String(++n),
  startedAt: new Date(Date.UTC(2026, 9, 1) + minutes * 60_000),
  durationSec: 1_800,
  heroId: 1,
  result,
  kills: 0,
  deaths: 0,
  assists: 0,
  ranked,
  queueClass: "solo",
  partySize: null,
});

describe("tiltStats", () => {
  it("counts games after 2+ and 3+ straight losses within a session", () => {
    const session1 = [g(0, "loss"), g(35, "loss"), g(70, "loss"), g(105, "win"), g(140, "loss")];
    // A new session (long gap) resets the streak.
    const session2 = [g(1_000, "win")];
    const s = tiltStats([...session1, ...session2], 60);
    expect(s.baseline).toEqual({ games: 6, wins: 2, rate: 2 / 6 });
    // After 2+ losses: game 3 (loss) and game 4 (win). After 3+: game 4 (win).
    expect(s.afterLosses[2]).toEqual({ games: 2, wins: 1, rate: 0.5 });
    expect(s.afterLosses[3]).toEqual({ games: 1, wins: 1, rate: 1 });
  });

  it("ignores unranked games, but they keep a session going like on the Sessions page", () => {
    const s = tiltStats([g(0, "loss", false), g(35, "win")], 60);
    expect(s.baseline.games).toBe(1);
    // Ranked loss, two unranked games, ranked loss: one session, two ranked losses in a row.
    const games = [g(0, "loss"), g(45, "win", false), g(90, "win", false), g(135, "loss")];
    const end = Date.UTC(2026, 9, 1) + 165 * 60_000;
    expect(currentLossStreak(games, 60, new Date(end + 10 * 60_000))).toBe(2);
  });
});

describe("currentLossStreak", () => {
  it("counts losses at the end of a session still going, else zero", () => {
    const games = [g(0, "win"), g(35, "loss"), g(70, "loss")];
    const end = Date.UTC(2026, 9, 1) + 100 * 60_000; // game 3 ended at 100 min
    expect(currentLossStreak(games, 60, new Date(end + 10 * 60_000))).toBe(2);
    expect(currentLossStreak(games, 60, new Date(end + 2 * 3_600_000))).toBe(0);
  });
});

describe("tiltWarning", () => {
  const base = { games: 400, wins: 208, rate: 0.52 };
  const stats = (after3: number, games = 50) => ({
    baseline: base,
    afterLosses: {
      2: { games: 100, wins: 47, rate: 0.47 },
      3: { games, wins: Math.round(after3 * games), rate: after3 },
    },
  });

  it("warns on a streak when history shows a clear drop", () => {
    expect(tiltWarning(stats(0.41), 3)).toMatchObject({ streak: 3, after: { rate: 0.41 } });
    expect(tiltWarning(stats(0.41), 2)).toMatchObject({ streak: 2, after: { rate: 0.47 } });
  });

  it("stays quiet without a streak, a real drop, or enough games", () => {
    expect(tiltWarning(stats(0.41), 1)).toBeNull();
    expect(tiltWarning(stats(0.51), 3)).toBeNull();
    expect(tiltWarning(stats(0.3, 10), 3)).toBeNull();
  });
});
