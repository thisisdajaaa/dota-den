/**
 * A share is a snapshot of what the owner chose to show, frozen when they shared it: later
 * games, notes and MMR never leak through an old link. MMR is never part of a share.
 */

export type ShareKind = "session" | "week" | "journey";

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

export type ShareSnapshot = SessionShare | WeekShare | JourneyShare;

export const MAX_HEROES = 5;

/** Share links: 12 characters from a 62-letter alphabet (~71 bits, not guessable). */
export const SLUG_PATTERN = /^[A-Za-z0-9]{12}$/;

export function winRate(s: { games: number; wins: number }): number | null {
  return s.games > 0 ? s.wins / s.games : null;
}

/** Nothing to show: a share needs at least one game (a journey, at least one medal). */
export function isEmpty(s: ShareSnapshot): boolean {
  return s.kind === "journey" ? s.medals.length === 0 : s.games === 0;
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
