import {
  ESTIMATE_PER_GAME,
  type Observation,
  type QueueScope,
  type RankedResult,
} from "./calendar";

export interface HeroRankedResult extends RankedResult {
  heroId: number;
}

export interface HeroClimb {
  heroId: number;
  games: number;
  wins: number;
  losses: number;
  /** Win/loss-based estimate (±ESTIMATE_PER_GAME per game). Always labelled in the UI. */
  estimatedNet: number;
  /**
   * Exact change from the user's own entries, counted only for spans between two entries
   * where every ranked game was on this hero. Null when no such span exists.
   */
  exact: { delta: number; games: number } | null;
  /** Cumulative estimated net after each game, oldest first. */
  path: number[];
  lastPlayed: Date;
}

/**
 * MMR climb by hero for a period. Dota doesn't report MMR per hero, so the per-hero number
 * is the labelled win/loss estimate; an exact figure appears only when the user's entries
 * isolate games on a single hero. Nothing here turns an estimate into an actual value.
 */
export function climbByHero(input: {
  observations: readonly Observation[];
  matches: readonly HeroRankedResult[];
  scope: QueueScope;
  /** Matches are known for this range only; spans reaching outside it can't be exact. */
  loaded: { from: Date; to: Date };
  inPeriod: (at: Date) => boolean;
}): HeroClimb[] {
  const inScope = (m: RankedResult) => input.scope === "all" || m.queueClass === input.scope;
  const matches = [...input.matches]
    .filter((m) => input.inPeriod(m.startedAt))
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const byHero = new Map<number, HeroClimb>();
  for (const m of matches) {
    if (!inScope(m)) continue;
    const h = byHero.get(m.heroId) ?? {
      heroId: m.heroId,
      games: 0,
      wins: 0,
      losses: 0,
      estimatedNet: 0,
      exact: null,
      path: [],
      lastPlayed: m.startedAt,
    };
    h.games++;
    if (m.result === "win") h.wins++;
    else h.losses++;
    h.estimatedNet += m.result === "win" ? ESTIMATE_PER_GAME : -ESTIMATE_PER_GAME;
    h.path.push(h.estimatedNet);
    h.lastPlayed = m.startedAt;
    byHero.set(m.heroId, h);
  }

  const obs = [...input.observations].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  for (let i = 1; i < obs.length; i++) {
    const from = obs[i - 1];
    const to = obs[i];
    if (from.observedAt < input.loaded.from || to.observedAt > input.loaded.to) continue;
    // Same boundaries as the calendar: after one entry, up to and including the next.
    const between = input.matches.filter(
      (m) => m.startedAt > from.observedAt && m.startedAt <= to.observedAt,
    );
    if (between.length === 0) continue;
    const heroId = between[0].heroId;
    const isolated = between.every(
      (m) => m.heroId === heroId && inScope(m) && input.inPeriod(m.startedAt),
    );
    const h = byHero.get(heroId);
    if (!isolated || !h) continue;
    h.exact = {
      delta: (h.exact?.delta ?? 0) + (to.mmr - from.mmr),
      games: (h.exact?.games ?? 0) + between.length,
    };
  }

  return [...byHero.values()].sort(
    (a, b) => b.games - a.games || b.estimatedNet - a.estimatedNet || a.heroId - b.heroId,
  );
}
