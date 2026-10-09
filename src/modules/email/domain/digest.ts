import {
  achievements,
  type AchievementGame,
  type AchievementId,
} from "@/modules/achievements/domain/achievements";
import { tiltWarning, type TiltStats, type WinRate } from "@/modules/sessions/domain/tilt";

/** The weekly email is sent at most once per player and week (Monday's date is the key). */
export const DIGEST_KIND = "weekly_digest";

export interface DigestHero {
  heroId: number;
  games: number;
  wins: number;
}

/** Last week, as the email shows it. */
export interface DigestWeek {
  from: string;
  to: string;
  games: number;
  wins: number;
  losses: number;
  /** Only an exact change (MMR entries bracket the week's games); never the estimate. */
  mmrExact: number | null;
  mostPlayed: DigestHero | null;
  best: DigestHero | null;
}

/** One honest observation for the email, only when the data supports it. */
export type DigestNote =
  | { kind: "achievement"; id: AchievementId; n: number }
  | { kind: "tilt"; streak: number; after: WinRate; baseline: WinRate };

/** Achievements that can be dated from games alone (the others count drafts and MMR days). */
const DATED: readonly AchievementId[] = ["streak", "pool", "marathon", "comeback", "veteran"];

type Sessions = ReadonlyArray<{ matches: readonly AchievementGame[] }>;
/** Where a game falls against the week: before it (-1), in it (0) or after it (1). */
type WeekOf = (d: Date) => -1 | 0 | 1;

function gamesUpTo(sessions: Sessions, weekOf: WeekOf, last: -1 | 0): Sessions {
  return sessions
    .map((s) => ({ matches: s.matches.filter((m) => weekOf(m.startedAt) <= last) }))
    .filter((s) => s.matches.length > 0);
}

/** An achievement tier first reached during the week (the highest new one), if any. */
export function newAchievement(sessions: Sessions, weekOf: WeekOf): DigestNote | null {
  const zero = { mmrDays: 0, drafts: 0, challenges: 0 };
  const before = achievements({ sessions: gamesUpTo(sessions, weekOf, -1), ...zero });
  const after = achievements({ sessions: gamesUpTo(sessions, weekOf, 0), ...zero });
  for (const a of after) {
    if (!DATED.includes(a.id)) continue;
    const was = before.find((b) => b.id === a.id)?.tier ?? 0;
    if (a.tier > was) return { kind: "achievement", id: a.id, n: a.tiers[a.tier - 1] };
  }
  return null;
}

/** The longest run of ranked losses inside one session during the week. */
export function longestLossStreak(
  sessions: ReadonlyArray<{ matches: ReadonlyArray<{ startedAt: Date; result: "win" | "loss" }> }>,
  weekOf: WeekOf,
): number {
  let longest = 0;
  for (const s of sessions) {
    let run = 0;
    for (const m of s.matches) {
      if (weekOf(m.startedAt) !== 0) {
        run = 0;
        continue;
      }
      run = m.result === "loss" ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  return longest;
}

/**
 * The tilt check's observation, only when last week had a losing streak AND the player's own
 * history shows a clear drop after streaks like it (the tilt check's own thresholds).
 */
export function tiltNote(stats: TiltStats, streak: number): DigestNote | null {
  const warning = tiltWarning(stats, streak);
  return warning
    ? { kind: "tilt", streak: warning.streak, after: warning.after, baseline: warning.baseline }
    : null;
}

/** A new achievement is the better news; otherwise the tilt observation; otherwise nothing. */
export function pickNote(...candidates: ReadonlyArray<DigestNote | null>): DigestNote | null {
  return candidates.find((c) => c !== null) ?? null;
}
