/**
 * Session companion (pure, Plus): while a player is in Dota, each finished game is announced
 * with their record in the current session and, when their own history backs it, a tilt
 * warning ("after 2 losses in a row you win 41% of the next game, 53% normally"). Only their
 * own imported results; the warning uses the same rule as the Sessions page.
 */
import { groupSessions, type SessionMatch } from "./session";
import { tiltStats, tiltWarning, type TiltWarning } from "./tilt";

/** A player counts as playing for this long after Steam last showed them in Dota. */
export const PLAYING_GRACE_MS = 30 * 60_000;
/** Matches are synced at most this often per player while they play. */
export const COMPANION_SYNC_EVERY_MS = 4 * 60_000;
/** At most this many games announced per run (a backlog after a long game is old news). */
const MAX_NEWS = 3;
/** Games older than this when found aren't announced (a sync catching up much later). */
const MAX_NEWS_AGE_MS = 6 * 3_600_000;

/** Dota 2's Steam app id, as GetPlayerSummaries reports the game being played. */
export const DOTA_APP_ID = "570";

export interface GameNews {
  matchId: string;
  heroId: number;
  result: "win" | "loss";
  ranked: boolean;
  /** The current session up to and including this game. */
  session: { wins: number; losses: number };
  /** Set when the player is on a losing streak their history says hurts them. */
  tilt: TiltWarning | null;
}

/**
 * The games finished since `watermark`, oldest first, each with the session record up to it
 * and a tilt warning when one applies after it.
 */
export function gameNews(
  matches: readonly SessionMatch[],
  gapMinutes: number,
  watermark: Date,
  now: Date,
): GameNews[] {
  const fresh = matches
    .filter(
      (m) =>
        m.startedAt.getTime() > watermark.getTime() &&
        now.getTime() - m.startedAt.getTime() <= MAX_NEWS_AGE_MS,
    )
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .slice(-MAX_NEWS);
  if (fresh.length === 0) return [];
  const stats = tiltStats(matches, gapMinutes);
  const sessions = groupSessions(0, matches, gapMinutes);
  return fresh.map((m) => {
    const session = sessions.find((s) => s.matches.some((x) => x.matchId === m.matchId));
    const upTo = session
      ? session.matches.filter((x) => x.startedAt.getTime() <= m.startedAt.getTime())
      : [m];
    // The losing streak counts ranked games, like the Sessions page.
    let streak = 0;
    const ranked = upTo.filter((x) => x.ranked);
    for (let i = ranked.length - 1; i >= 0 && ranked[i].result === "loss"; i--) streak++;
    return {
      matchId: m.matchId,
      heroId: m.heroId,
      result: m.result,
      ranked: m.ranked,
      session: {
        wins: upTo.filter((x) => x.result === "win").length,
        losses: upTo.filter((x) => x.result === "loss").length,
      },
      tilt: m.result === "loss" ? tiltWarning(stats, streak) : null,
    };
  });
}

export interface CompanionState {
  /** When Steam last showed them in Dota. */
  lastInGameAt: Date | null;
  lastSyncAt: Date | null;
  /** Games that started after this haven't been announced yet. */
  watermark: Date | null;
}

/** Whether to look for new games for this player now, given where Steam says they are. */
export function shouldCheck(state: CompanionState, inDota: boolean, now: Date): boolean {
  const playing =
    inDota ||
    (state.lastInGameAt !== null &&
      now.getTime() - state.lastInGameAt.getTime() < PLAYING_GRACE_MS);
  if (!playing) return false;
  return (
    state.lastSyncAt === null ||
    now.getTime() - state.lastSyncAt.getTime() >= COMPANION_SYNC_EVERY_MS
  );
}
