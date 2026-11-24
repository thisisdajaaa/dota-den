/**
 * A share is a snapshot of what the owner chose to show, frozen when they shared it: later
 * games, notes and MMR never leak through an old link. MMR is never part of a share.
 */

import { MIN_YEAR_GAMES } from "@/modules/report/domain/year-review";

export type ShareKind = "session" | "week" | "journey" | "streak" | "match" | "year";

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

/** The ranges a rank journey can cover (same keys as the MMR page's range selector). */
export const JOURNEY_SHARE_RANGES = ["3m", "6m", "1y", "all"] as const;
export type JourneyShareRange = (typeof JOURNEY_SHARE_RANGES)[number];

export interface JourneyShareMedal {
  rankTier: number;
  at: Date;
  /** Held since before the range started. */
  carried: boolean;
}

export interface JourneyShareStretch {
  fromTier: number;
  toTier: number;
  from: Date;
  to: Date;
  /** Net change in stars (Immortal one above Divine 5). */
  steps: number;
  games: number;
  wins: number;
  losses: number;
  heroes: ShareHero[];
}

/**
 * A rank journey by medal only. Medals are public on the player's profile; logged MMR is
 * private, so no MMR value, peak or stretch is ever copied in here (see toJourneyShare).
 */
export interface JourneyShare {
  kind: "journey";
  range: JourneyShareRange;
  from: Date;
  to: Date;
  medals: JourneyShareMedal[];
  /** Last time the latest medal was confirmed. */
  lastSeenAt: Date | null;
  peak: { rankTier: number; at: Date } | null;
  low: { rankTier: number; at: Date } | null;
  climb: JourneyShareStretch | null;
  slide: JourneyShareStretch | null;
  games: number;
  wins: number;
  losses: number;
  /** Most played over the range, at most MAX_HEROES. */
  heroes: ShareHero[];
}

/** The current win streak: consecutive wins up to the newest imported game. */
export interface StreakShare {
  kind: "streak";
  /** Wins in a row (all of `games`). */
  games: number;
  wins: number;
  losses: 0;
  /** First and last game of the streak. */
  from: Date;
  to: Date;
  /** Most played in the streak first, at most MAX_HEROES. */
  heroes: ShareHero[];
  kills: number;
  deaths: number;
  assists: number;
}

/** One of the player's own games: only their own line (no other player is named). */
export interface MatchShare {
  kind: "match";
  matchId: string;
  startedAt: Date;
  durationSec: number;
  heroId: number;
  result: "win" | "loss";
  games: 1;
  wins: 0 | 1;
  losses: 0 | 1;
  kills: number;
  deaths: number;
  assists: number;
  /** null when the upstream didn't report it (unparsed replays). */
  heroDamage: number | null;
  goldPerMin: number | null;
  lastHits: number | null;
}

/** A calendar year of the owner's imported games (their year in review). No MMR. */
export interface YearShare {
  kind: "year";
  year: number;
  games: number;
  wins: number;
  losses: number;
  /** Total game time, in seconds. */
  playedSec: number;
  heroesPlayed: number;
  /** Most played first, at most MAX_HEROES. */
  heroes: ShareHero[];
  /** Wins in a row, the year's longest (0 without a win). */
  longestWinStreak: number;
  /** The win with the best K+A−D. */
  bestGame: { heroId: number; kills: number; deaths: number; assists: number } | null;
}

export type ShareSnapshot =
  SessionShare | WeekShare | JourneyShare | StreakShare | MatchShare | YearShare;

export const MAX_HEROES = 5;

/** A win streak is worth a card from this many wins in a row. */
export const MIN_STREAK = 3;

/** Share links: 12 characters from a 62-letter alphabet (~71 bits, not guessable). */
export const SLUG_PATTERN = /^[A-Za-z0-9]{12}$/;

export function winRate(s: { games: number; wins: number }): number | null {
  return s.games > 0 ? s.wins / s.games : null;
}

/** Nothing to show: a share needs at least one game (a journey, at least one medal). */
export function isEmpty(s: ShareSnapshot): boolean {
  if (s.kind === "journey") return s.medals.length === 0;
  if (s.kind === "streak") return s.games < MIN_STREAK;
  if (s.kind === "year") return s.games < MIN_YEAR_GAMES;
  return s.games === 0;
}

/** What a streak is read from: imported games (any order). */
export interface StreakGameIn {
  matchId: string;
  startedAt: Date;
  heroId: number;
  result: "win" | "loss";
  kills: number;
  deaths: number;
  assists: number;
}

const byPlayed = (a: ShareHero, b: ShareHero) => b.games - a.games || a.heroId - b.heroId;

/**
 * The wins in a row up to the newest game, as a share (null without any win). `ref` is the
 * streak's first match, so sharing a growing streak again refreshes the same link.
 */
export function toStreakShare(
  games: readonly StreakGameIn[],
): { share: StreakShare; ref: string } | null {
  const newestFirst = [...games].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const end = newestFirst.findIndex((g) => g.result !== "win");
  const run = end === -1 ? newestFirst : newestFirst.slice(0, end);
  if (run.length === 0) return null;
  const heroes = new Map<number, ShareHero>();
  for (const g of run) {
    const h = heroes.get(g.heroId) ?? { heroId: g.heroId, games: 0, wins: 0 };
    h.games += 1;
    h.wins += 1;
    heroes.set(g.heroId, h);
  }
  const first = run[run.length - 1];
  const sum = (k: "kills" | "deaths" | "assists") => run.reduce((n, g) => n + g[k], 0);
  return {
    ref: first.matchId,
    share: {
      kind: "streak",
      games: run.length,
      wins: run.length,
      losses: 0,
      from: first.startedAt,
      to: run[0].startedAt,
      heroes: [...heroes.values()].sort(byPlayed).slice(0, MAX_HEROES),
      kills: sum("kills"),
      deaths: sum("deaths"),
      assists: sum("assists"),
    },
  };
}

/** What a match share is built from: the match and the owner's own line in it. */
export interface MatchShareIn {
  match: { matchId: string; startedAt: Date; durationSec: number; radiantWin: boolean };
  me: {
    side: "radiant" | "dire";
    heroId: number;
    kills: number;
    deaths: number;
    assists: number;
    heroDamage: number | null;
    goldPerMin: number;
    lastHits: number;
  };
}

/** The owner's own game. Fields are copied one by one: no other player's line comes along. */
export function toMatchShare({ match, me }: MatchShareIn): MatchShare {
  const won = (me.side === "radiant") === match.radiantWin;
  return {
    kind: "match",
    matchId: match.matchId,
    startedAt: match.startedAt,
    durationSec: match.durationSec,
    heroId: me.heroId,
    result: won ? "win" : "loss",
    games: 1,
    wins: won ? 1 : 0,
    losses: won ? 0 : 1,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    heroDamage: me.heroDamage,
    // 0 GPM / last hits means the upstream had nothing: unknown, not a real zero.
    goldPerMin: me.goldPerMin > 0 ? me.goldPerMin : null,
    lastHits: me.lastHits > 0 ? me.lastHits : null,
  };
}

/** What a journey share is built from (the rank journey, structurally). */
interface JourneyMedalIn {
  rankTier: number;
  at: Date;
  carried: boolean;
  lastSeenAt: Date;
}
interface JourneyRecordIn {
  games: number;
  wins: number;
  losses: number;
  heroes: ReadonlyArray<{ heroId: number; games: number; wins: number }>;
}
interface JourneyStretchIn extends JourneyRecordIn {
  from: JourneyMedalIn;
  to: JourneyMedalIn;
  steps: number;
}
export interface JourneyShareInput {
  range: JourneyShareRange;
  from: Date;
  to: Date;
  medals: readonly JourneyMedalIn[];
  medalPeak: JourneyMedalIn | null;
  medalLow: JourneyMedalIn | null;
  medalClimb: JourneyStretchIn | null;
  medalSlide: JourneyStretchIn | null;
  record: JourneyRecordIn;
}

const hero = (h: { heroId: number; games: number; wins: number }): ShareHero => ({
  heroId: h.heroId,
  games: h.games,
  wins: h.wins,
});

const stretch = (s: JourneyStretchIn | null): JourneyShareStretch | null =>
  s && {
    fromTier: s.from.rankTier,
    toTier: s.to.rankTier,
    from: s.from.at,
    to: s.to.at,
    steps: s.steps,
    games: s.games,
    wins: s.wins,
    losses: s.losses,
    heroes: s.heroes.slice(0, MAX_HEROES).map(hero),
  };

/**
 * The medal-only snapshot of a rank journey. Fields are copied one by one (never spread), so
 * the journey's MMR points, gaps and MMR stretches can't leak into a public link.
 */
export function toJourneyShare(j: JourneyShareInput): JourneyShare {
  const point = (p: JourneyMedalIn | null) => p && { rankTier: p.rankTier, at: p.at };
  return {
    kind: "journey",
    range: j.range,
    from: j.from,
    to: j.to,
    medals: j.medals.map((m) => ({ rankTier: m.rankTier, at: m.at, carried: m.carried })),
    lastSeenAt: j.medals.at(-1)?.lastSeenAt ?? null,
    peak: point(j.medalPeak),
    low: point(j.medalLow),
    climb: stretch(j.medalClimb),
    slide: stretch(j.medalSlide),
    games: j.record.games,
    wins: j.record.wins,
    losses: j.record.losses,
    heroes: j.record.heroes.slice(0, MAX_HEROES).map(hero),
  };
}

/** What a year share is built from (the year in review, structurally). */
export interface YearShareInput {
  year: number;
  games: number;
  wins: number;
  playedSec: number;
  heroesPlayed: number;
  topHeroes: ReadonlyArray<{ heroId: number; games: number; wins: number }>;
  longestWinStreak: { games: number } | null;
  bestGame: { heroId: number; kills: number; deaths: number; assists: number } | null;
}

/** The owner's year. Fields are copied one by one: nothing else from the review comes along. */
export function toYearShare(r: YearShareInput): YearShare {
  return {
    kind: "year",
    year: r.year,
    games: r.games,
    wins: r.wins,
    losses: r.games - r.wins,
    playedSec: r.playedSec,
    heroesPlayed: r.heroesPlayed,
    heroes: r.topHeroes
      .slice(0, MAX_HEROES)
      .map((h) => ({ heroId: h.heroId, games: h.games, wins: h.wins })),
    longestWinStreak: r.longestWinStreak?.games ?? 0,
    bestGame: r.bestGame
      ? {
          heroId: r.bestGame.heroId,
          kills: r.bestGame.kills,
          deaths: r.bestGame.deaths,
          assists: r.bestGame.assists,
        }
      : null,
  };
}
