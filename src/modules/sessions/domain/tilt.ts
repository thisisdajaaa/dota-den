import { groupSessions, type SessionMatch } from "./session";

/**
 * Tilt check (pure): how a player does in ranked games played right after losing streaks in
 * the same session, against their usual win rate. Only their own games; nothing is assumed.
 */

export interface WinRate {
  games: number;
  wins: number;
  rate: number;
}

export interface TiltStats {
  /** All ranked games in the history. */
  baseline: WinRate;
  /** Ranked games played after at least N straight losses in the same session. */
  afterLosses: { 2: WinRate; 3: WinRate };
}

export interface TiltWarning {
  /** Losses in a row in the current session. */
  streak: number;
  /** How the player did after a streak this long (the bucket for min(streak, 3)). */
  after: WinRate;
  baseline: WinRate;
}

/** Enough games after a streak to say anything. */
export const MIN_TILT_GAMES = 20;
/** Only warn when the drop is clear. */
export const MIN_TILT_DROP = 0.03;

const rate = (games: number, wins: number): WinRate => ({
  games,
  wins,
  rate: games ? wins / games : 0,
});

export function tiltStats(matches: readonly SessionMatch[], gapMinutes: number): TiltStats {
  let games = 0;
  let wins = 0;
  const after = { 2: { g: 0, w: 0 }, 3: { g: 0, w: 0 } };
  // Sessions as the Sessions page groups them (all games); only ranked games count.
  for (const session of groupSessions(0, matches, gapMinutes)) {
    let streak = 0;
    for (const m of session.matches.filter((x) => x.ranked)) {
      const won = m.result === "win";
      games++;
      if (won) wins++;
      for (const k of [2, 3] as const) {
        if (streak >= k) {
          after[k].g++;
          if (won) after[k].w++;
        }
      }
      streak = won ? 0 : streak + 1;
    }
  }
  return {
    baseline: rate(games, wins),
    afterLosses: { 2: rate(after[2].g, after[2].w), 3: rate(after[3].g, after[3].w) },
  };
}

/** Losses in a row at the end of the current session, if it's still going (within the gap). */
export function currentLossStreak(
  matches: readonly SessionMatch[],
  gapMinutes: number,
  now: Date,
): number {
  // Sessions as the Sessions page groups them (all games); the streak counts ranked games.
  const last = groupSessions(0, matches, gapMinutes).at(-1);
  if (!last || now.getTime() - last.endedAt.getTime() > gapMinutes * 60_000) return 0;
  const ranked = last.matches.filter((m) => m.ranked);
  let streak = 0;
  for (let i = ranked.length - 1; i >= 0 && ranked[i].result === "loss"; i--) streak++;
  return streak;
}

/**
 * A warning only when the player is on a losing streak right now AND their own history
 * shows a clear drop after streaks like it, from enough games to trust.
 */
export function tiltWarning(stats: TiltStats, streak: number): TiltWarning | null {
  if (streak < 2) return null;
  const after = stats.afterLosses[streak >= 3 ? 3 : 2];
  if (after.games < MIN_TILT_GAMES) return null;
  if (stats.baseline.rate - after.rate < MIN_TILT_DROP) return null;
  return { streak, after, baseline: stats.baseline };
}
