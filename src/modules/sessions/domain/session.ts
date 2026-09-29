/**
 * Play sessions (spec §2.1): adjacent matches grouped by an inactivity gap. Pure: no I/O,
 * no framework. Raw match timestamps are kept as-is; nothing here rounds or shifts them.
 */

/** Allowed inactivity gaps, in minutes. The user picks one; 60 is the default. */
export const GAP_OPTIONS = [30, 60, 90, 120] as const;
export type GapMinutes = (typeof GAP_OPTIONS)[number];
export const DEFAULT_GAP_MINUTES: GapMinutes = 60;

export function isGapMinutes(v: unknown): v is GapMinutes {
  return typeof v === "number" && (GAP_OPTIONS as readonly number[]).includes(v);
}

export type QueueClass = "solo" | "party" | "unknown";

/** The slice of a player's match this context needs (structurally a subset of a match fact). */
export interface SessionMatch {
  matchId: string;
  startedAt: Date;
  durationSec: number;
  heroId: number;
  result: "win" | "loss";
  kills: number;
  deaths: number;
  assists: number;
  ranked: boolean;
  queueClass: QueueClass;
  partySize: number | null;
}

export interface HeroPlayed {
  heroId: number;
  games: number;
  wins: number;
}

export interface GamePick<M extends SessionMatch = SessionMatch> {
  match: M;
  /** kills + assists − deaths: the transparent rule used to pick best and worst games. */
  score: number;
}

export interface SessionStats<M extends SessionMatch = SessionMatch> {
  games: number;
  wins: number;
  losses: number;
  ranked: { games: number; wins: number; losses: number };
  /** Missing party size stays `unknown`; it is never counted as solo. */
  queue: Record<QueueClass, number>;
  /** Most played first, then most recently played. */
  heroes: HeroPlayed[];
  /** Sum of match durations (time actually in games). */
  playSec: number;
  /** First start to last end, including time between games. */
  spanSec: number;
  longestWinStreak: number;
  longestLossStreak: number;
  /** Win with the highest K+A−D; null when the session has no wins. */
  best: GamePick<M> | null;
  /** Loss with the lowest K+A−D; null when the session has no losses. */
  worst: GamePick<M> | null;
}

export interface PlaySession<M extends SessionMatch = SessionMatch> {
  /** Stable while the first match stays first: `${accountId32}:${firstMatchId}`. */
  id: string;
  accountId32: number;
  startedAt: Date;
  /** Latest match end (start + duration) in the session. */
  endedAt: Date;
  /** Oldest first. */
  matches: M[];
  stats: SessionStats<M>;
}

export const SESSION_ID_PATTERN = /^(\d{1,10}):(\d{1,20})$/;

export function sessionIdFor(accountId32: number, firstMatchId: string): string {
  return `${accountId32}:${firstMatchId}`;
}

/** A session id from a URL segment, where the ":" may arrive percent-encoded. */
export function sessionIdFromParam(raw: string): string | null {
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return SESSION_ID_PATTERN.test(id) ? id : null;
}

export function parseSessionId(id: string): { accountId32: number; firstMatchId: string } | null {
  const m = SESSION_ID_PATTERN.exec(id);
  if (!m) return null;
  return { accountId32: Number(m[1]), firstMatchId: m[2] };
}

export const matchEnd = (m: SessionMatch): number => m.startedAt.getTime() + m.durationSec * 1000;

/** K+A−D. Shown in the UI next to the best/worst game so the rule is visible. */
export const gameScore = (m: SessionMatch): number => m.kills + m.assists - m.deaths;

function byStart(a: SessionMatch, b: SessionMatch): number {
  const d = a.startedAt.getTime() - b.startedAt.getTime();
  // Tie-break on match id (numeric strings) so grouping is deterministic.
  return d !== 0
    ? d
    : a.matchId.length - b.matchId.length ||
        (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0);
}

/**
 * Group matches into sessions, oldest first. A new session starts when the time from the
 * end of the session so far (latest start + duration) to the next match's start is MORE
 * than the gap; a break of exactly the gap stays in the same session.
 */
export function groupSessions<M extends SessionMatch>(
  accountId32: number,
  matches: readonly M[],
  gapMinutes: number,
): PlaySession<M>[] {
  const gapMs = gapMinutes * 60_000;
  const sorted = [...matches].sort(byStart);
  const groups: M[][] = [];
  let current: M[] = [];
  let currentEnd = -Infinity;
  for (const m of sorted) {
    if (current.length > 0 && m.startedAt.getTime() - currentEnd > gapMs) {
      groups.push(current);
      current = [];
      currentEnd = -Infinity;
    }
    current.push(m);
    currentEnd = Math.max(currentEnd, matchEnd(m));
  }
  if (current.length > 0) groups.push(current);
  return groups.map((g) => buildSession(accountId32, g));
}

function buildSession<M extends SessionMatch>(accountId32: number, matches: M[]): PlaySession<M> {
  const startedAt = matches[0].startedAt;
  const endedAt = new Date(Math.max(...matches.map(matchEnd)));
  return {
    id: sessionIdFor(accountId32, matches[0].matchId),
    accountId32,
    startedAt,
    endedAt,
    matches,
    stats: summarizeSession(matches, startedAt, endedAt),
  };
}

/** Stats for one session's matches (oldest first). */
export function summarizeSession<M extends SessionMatch>(
  matches: readonly M[],
  startedAt: Date,
  endedAt: Date,
): SessionStats<M> {
  const queue: Record<QueueClass, number> = { solo: 0, party: 0, unknown: 0 };
  const ranked = { games: 0, wins: 0, losses: 0 };
  const heroes = new Map<number, HeroPlayed & { last: number }>();
  let wins = 0;
  let playSec = 0;
  let winRun = 0;
  let lossRun = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let best: GamePick<M> | null = null;
  let worst: GamePick<M> | null = null;

  for (const [i, m] of matches.entries()) {
    const win = m.result === "win";
    if (win) wins++;
    queue[m.queueClass]++;
    playSec += m.durationSec;
    if (m.ranked) {
      ranked.games++;
      if (win) ranked.wins++;
      else ranked.losses++;
    }
    const h = heroes.get(m.heroId) ?? { heroId: m.heroId, games: 0, wins: 0, last: i };
    h.games++;
    if (win) h.wins++;
    h.last = i;
    heroes.set(m.heroId, h);

    winRun = win ? winRun + 1 : 0;
    lossRun = win ? 0 : lossRun + 1;
    longestWinStreak = Math.max(longestWinStreak, winRun);
    longestLossStreak = Math.max(longestLossStreak, lossRun);

    // Ties keep the earlier game.
    const score = gameScore(m);
    if (win && (best === null || score > best.score)) best = { match: m, score };
    if (!win && (worst === null || score < worst.score)) worst = { match: m, score };
  }

  return {
    games: matches.length,
    wins,
    losses: matches.length - wins,
    ranked,
    queue,
    heroes: [...heroes.values()]
      .sort((a, b) => b.games - a.games || b.last - a.last)
      .map(({ heroId, games, wins: w }) => ({ heroId, games, wins: w })),
    playSec,
    spanSec: Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)),
    longestWinStreak,
    longestLossStreak,
    best,
    worst,
  };
}
