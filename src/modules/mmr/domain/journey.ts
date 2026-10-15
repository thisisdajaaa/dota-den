import type { Observation } from "./calendar";
import type { HeroRankedResult } from "./hero-climb";
import type { MedalSnapshot } from "./medal-history";

/**
 * Rank journey (pure): a player's climb over months, from two separate sources that are never
 * mixed. Medals come from Valve (exact about the medal, dated when we noticed the change).
 * MMR comes only from the player's own entries (exact at the moment logged, unknown between).
 * Nothing here estimates MMR, and nothing fills a gap between entries.
 *
 * Stretches (best climb, worst slide):
 * - MMR: the largest net rise (or fall) from one logged entry to a later one at least
 *   MIN_STRETCH_DAYS apart. Entries closer together are ignored as a pair, so a single noisy
 *   session can't be a "climb".
 * - Medal: the largest net rise (or fall) in medal steps (one step per star, Immortal one step
 *   above Ancient/Divine 5) from one medal sighting to a later one. A medal change is a stretch
 *   on its own, so there's no minimum length beyond one step.
 * A stretch with no change isn't a climb or a slide; ties go to the shorter stretch, then the
 * earlier one.
 */

export type JourneyRange = "3m" | "6m" | "1y" | "all";
export const JOURNEY_RANGES: readonly JourneyRange[] = ["3m", "6m", "1y", "all"];
const RANGE_MONTHS: Record<Exclude<JourneyRange, "all">, number> = { "3m": 3, "6m": 6, "1y": 12 };

export const MIN_STRETCH_DAYS = 7;
/** Entries further apart than this are shown with a break in the line, and the gap is named. */
export const GAP_DAYS = 30;
export const STRETCH_HEROES = 3;
const DAY_MS = 86_400_000;

export function isJourneyRange(v: string | undefined): v is JourneyRange {
  return JOURNEY_RANGES.some((r) => r === v);
}

/** Medal steps: Herald 1 = 0 … Divine 5 = 34, Immortal = 35. */
export function medalStep(rankTier: number): number {
  if (rankTier >= 80) return 35;
  return (Math.floor(rankTier / 10) - 1) * 5 + ((rankTier % 10) - 1);
}

/** Start of a range ending at `now`; "all" starts at the earliest thing we know about. */
export function journeyStart(range: JourneyRange, now: Date, earliest: Date | null): Date {
  if (range === "all") return earliest && earliest < now ? earliest : now;
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - RANGE_MONTHS[range]);
  return d;
}

export interface MedalPoint {
  rankTier: number;
  /** When the timeline shows this medal from: first sighting, or the range start if earlier. */
  at: Date;
  /** First sighting (before the range when the medal was carried in). */
  firstSeenAt: Date;
  /** Last confirmation of this medal. */
  lastSeenAt: Date;
  /** Held since before the range started. */
  carried: boolean;
}

export interface MmrPoint {
  at: Date;
  mmr: number;
}

export interface Gap {
  from: Date;
  to: Date;
  days: number;
}

export interface HeroRecord {
  heroId: number;
  games: number;
  wins: number;
  losses: number;
}

export interface StretchRecord {
  games: number;
  wins: number;
  losses: number;
  /** Most played first, at most STRETCH_HEROES. */
  heroes: HeroRecord[];
}

export interface MedalStretch extends StretchRecord {
  from: MedalPoint;
  to: MedalPoint;
  /** Net change in medal steps (stars). */
  steps: number;
}

export interface MmrStretch extends StretchRecord {
  from: MmrPoint;
  to: MmrPoint;
  delta: number;
}

export interface Journey {
  range: JourneyRange;
  from: Date;
  to: Date;
  medals: MedalPoint[];
  mmr: MmrPoint[];
  /** Spans between consecutive entries longer than GAP_DAYS: nothing is known there. */
  gaps: Gap[];
  medalPeak: MedalPoint | null;
  medalLow: MedalPoint | null;
  mmrPeak: MmrPoint | null;
  mmrLow: MmrPoint | null;
  medalClimb: MedalStretch | null;
  medalSlide: MedalStretch | null;
  mmrClimb: MmrStretch | null;
  mmrSlide: MmrStretch | null;
  /** Ranked record over the whole range, from stored match facts. */
  record: StretchRecord;
}

/** Ranked games after `from` up to and including `to` (the calendar's rule), with top heroes. */
export function stretchRecord(
  matches: readonly HeroRankedResult[],
  from: Date,
  to: Date,
  limit = STRETCH_HEROES,
): StretchRecord {
  const byHero = new Map<number, HeroRecord>();
  let wins = 0;
  let games = 0;
  for (const m of matches) {
    if (m.startedAt <= from || m.startedAt > to) continue;
    games++;
    const h = byHero.get(m.heroId) ?? { heroId: m.heroId, games: 0, wins: 0, losses: 0 };
    h.games++;
    if (m.result === "win") {
      h.wins++;
      wins++;
    } else h.losses++;
    byHero.set(m.heroId, h);
  }
  const heroes = [...byHero.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.heroId - b.heroId)
    .slice(0, limit);
  return { games, wins, losses: games - wins, heroes };
}

/**
 * The largest net rise (dir 1) or fall (dir -1) from an earlier point to a later one at least
 * `minMs` apart. Ties: the shorter stretch, then the earlier one. Null when nothing moved
 * that way.
 */
function extremeStretch<P>(
  points: readonly P[],
  time: (p: P) => number,
  value: (p: P) => number,
  dir: 1 | -1,
  minMs: number,
): { from: P; to: P; delta: number } | null {
  let best: { from: P; to: P; delta: number; span: number } | null = null;
  for (let j = 1; j < points.length; j++) {
    for (let i = j - 1; i >= 0; i--) {
      const span = time(points[j]) - time(points[i]);
      if (span < minMs) continue;
      const delta = value(points[j]) - value(points[i]);
      if (delta * dir <= 0) continue;
      if (!best || delta * dir > best.delta * dir || (delta === best.delta && span < best.span)) {
        best = { from: points[i], to: points[j], delta, span };
      }
    }
  }
  return best && { from: best.from, to: best.to, delta: best.delta };
}

/** Medal timeline inside the range: the medal held at its start, then every change. */
export function medalTimeline(
  snapshots: readonly MedalSnapshot[],
  from: Date,
  to: Date,
): MedalPoint[] {
  const sorted = [...snapshots]
    .filter((s) => s.observedAt <= to)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const out: MedalPoint[] = [];
  for (const s of sorted) {
    const lastSeenAt = s.lastSeenAt ?? s.observedAt;
    const last = out.at(-1);
    if (last && last.rankTier === s.rankTier) {
      if (lastSeenAt > last.lastSeenAt) last.lastSeenAt = lastSeenAt;
      continue;
    }
    if (s.observedAt < from) {
      // Before the range: only the latest one matters, and only if still held at the start.
      out.length = 0;
      out.push({
        rankTier: s.rankTier,
        at: from,
        firstSeenAt: s.observedAt,
        lastSeenAt,
        carried: true,
      });
      continue;
    }
    out.push({
      rankTier: s.rankTier,
      at: s.observedAt,
      firstSeenAt: s.observedAt,
      lastSeenAt,
      carried: false,
    });
  }
  return out;
}

export function buildJourney(input: {
  range: JourneyRange;
  now: Date;
  medals: readonly MedalSnapshot[];
  observations: readonly Observation[];
  /** Ranked games only. */
  matches: readonly HeroRankedResult[];
}): Journey {
  const { range, now } = input;
  const earliest = [
    ...input.medals.map((m) => m.observedAt),
    ...input.observations.map((o) => o.observedAt),
  ].sort((a, b) => a.getTime() - b.getTime())[0];
  const from = journeyStart(range, now, earliest ?? null);
  const to = now;

  const medals = medalTimeline(input.medals, from, to);
  const mmr = input.observations
    .filter((o) => o.observedAt >= from && o.observedAt <= to)
    .map((o) => ({ at: o.observedAt, mmr: o.mmr }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const matches = input.matches.filter((m) => m.startedAt >= from && m.startedAt <= to);

  const gaps: Gap[] = [];
  for (let i = 1; i < mmr.length; i++) {
    const days = Math.floor((mmr[i].at.getTime() - mmr[i - 1].at.getTime()) / DAY_MS);
    if (days > GAP_DAYS) gaps.push({ from: mmr[i - 1].at, to: mmr[i].at, days });
  }

  // Peak and low: the first time the extreme was reached.
  const pick = <P>(ps: readonly P[], v: (p: P) => number, dir: 1 | -1) =>
    ps.reduce<P | null>((b, p) => (b === null || (v(p) - v(b)) * dir > 0 ? p : b), null);
  const tier = (p: MedalPoint) => medalStep(p.rankTier);

  const withRecord = <S extends { from: { at: Date }; to: { at: Date } }>(s: S | null) =>
    s && { ...s, ...stretchRecord(matches, s.from.at, s.to.at) };
  const medalStretch = (dir: 1 | -1) => {
    const s = extremeStretch(medals, (p) => p.at.getTime(), tier, dir, 0);
    return withRecord(s && { from: s.from, to: s.to, steps: s.delta });
  };
  const mmrStretch = (dir: 1 | -1) =>
    withRecord(
      extremeStretch(
        mmr,
        (p) => p.at.getTime(),
        (p) => p.mmr,
        dir,
        MIN_STRETCH_DAYS * DAY_MS,
      ),
    );

  return {
    range,
    from,
    to,
    medals,
    mmr,
    gaps,
    medalPeak: pick(medals, tier, 1),
    medalLow: pick(medals, tier, -1),
    mmrPeak: pick(mmr, (p) => p.mmr, 1),
    mmrLow: pick(mmr, (p) => p.mmr, -1),
    medalClimb: medalStretch(1),
    medalSlide: medalStretch(-1),
    mmrClimb: mmrStretch(1),
    mmrSlide: mmrStretch(-1),
    record: stretchRecord(matches, new Date(from.getTime() - 1), to),
  };
}
