/**
 * A share is a snapshot of what the owner chose to show, frozen when they shared it: later
 * games, notes and MMR never leak through an old link. MMR is never part of a share.
 */

export type ShareKind = "session" | "week";

export interface ShareHero {
  heroId: number;
  games: number;
  wins: number;
}

export interface SessionShare {
  kind: "session";
  startedAt: Date;
  endedAt: Date;
  games: number;
  wins: number;
  losses: number;
  /** Most played first, at most MAX_HEROES. */
  heroes: ShareHero[];
  /** The win with the best K+A−D. */
  best: { heroId: number; kills: number; deaths: number; assists: number } | null;
}

export interface WeekShare {
  kind: "week";
  /** YYYY-MM-DD, the player's week. */
  from: string;
  to: string;
  games: number;
  wins: number;
  losses: number;
  mostPlayed: ShareHero | null;
  best: ShareHero | null;
}

export type ShareSnapshot = SessionShare | WeekShare;

export const MAX_HEROES = 5;

/** Share links: 12 characters from a 62-letter alphabet (~71 bits, not guessable). */
export const SLUG_PATTERN = /^[A-Za-z0-9]{12}$/;

export function winRate(s: { games: number; wins: number }): number | null {
  return s.games > 0 ? s.wins / s.games : null;
}

/** Nothing to show: a share needs at least one game. */
export function isEmpty(s: ShareSnapshot): boolean {
  return s.games === 0;
}
