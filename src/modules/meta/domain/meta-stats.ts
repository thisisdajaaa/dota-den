/**
 * Pure meta scoring: which heroes are strong for a position right now, and why.
 * Every number here comes from upstream counts; nothing is estimated or filled in.
 */
import { isSupportHero, POSITION_INFO, type Position } from "./position";

export interface WinCount {
  games: number;
  wins: number;
}

/** Public high-rank stats (Ancient, Divine, Immortal combined) plus 7-day public trends. */
export interface HeroPublicStats extends WinCount {
  heroId: number;
  /** Daily public picks across all ranks, oldest first (usually 7 days). */
  pickTrend: readonly number[];
}

/** Win counts per lane role (1 safe, 2 mid, 3 off, 4 jungle) from public parsed games. */
export type LaneStats = ReadonlyMap<number, WinCount>;

export interface ProDraftHero {
  heroId: number;
  picks: number;
  bans: number;
  leagues: number;
}

export interface ProDrafts {
  /** Pro drafts (matches with picks and bans) in the window. */
  drafts: number;
  windowDays: number;
  heroes: readonly ProDraftHero[];
}

/**
 * Pull a small sample's win rate toward 50%: (wins + 0.5k) / (games + k). With k "virtual
 * games" at an even record, a 3–0 hero doesn't outrank one that's 550–450.
 */
export function shrunkRate(wins: number, games: number, k: number, prior = 0.5): number {
  if (games <= 0 && k <= 0) return prior;
  return (wins + prior * k) / (games + k);
}

export function rate(c: WinCount): number | null {
  return c.games > 0 ? c.wins / c.games : null;
}

export interface PickTrend {
  /** Relative change in share of all public picks: +0.18 means picked 18% more often. */
  change: number;
  recentPicks: number;
  earlierPicks: number;
}

/**
 * Share-of-picks trend: the hero's share of all public picks in the last 3 days vs the first
 * 3 days of the series. Using shares (not raw counts) cancels out weekend traffic swings.
 * null when the series is too short or a window has no picks.
 */
export function pickTrend(
  hero: readonly number[],
  allHeroes: readonly number[],
  window = 3,
): PickTrend | null {
  const n = Math.min(hero.length, allHeroes.length);
  if (n < window * 2) return null;
  const sum = (xs: readonly number[], from: number, to: number) =>
    xs.slice(from, to).reduce((a, b) => a + b, 0);
  const earlierPicks = sum(hero, 0, window);
  const recentPicks = sum(hero, n - window, n);
  const earlierAll = sum(allHeroes, 0, window);
  const recentAll = sum(allHeroes, n - window, n);
  if (earlierPicks <= 0 || recentPicks <= 0 || earlierAll <= 0 || recentAll <= 0) return null;
  const change = recentPicks / recentAll / (earlierPicks / earlierAll) - 1;
  return { change, recentPicks, earlierPicks };
}

/** Day-by-day total of every hero's picks (the denominator for pick shares). */
export function totalPickTrend(heroes: readonly HeroPublicStats[]): number[] {
  const len = Math.max(0, ...heroes.map((h) => h.pickTrend.length));
  const out = Array.from({ length: len }, () => 0);
  for (const h of heroes) {
    // Only series of full length line up day by day.
    if (h.pickTrend.length !== len) continue;
    h.pickTrend.forEach((v, i) => (out[i] += v));
  }
  return out;
}

export interface HeroCandidate {
  heroId: number;
  roles: readonly string[];
  publicStats: HeroPublicStats | null;
  /** null when lane data couldn't be fetched for this hero. */
  lanes: LaneStats | null;
}

export interface RankedHero {
  heroId: number;
  score: number;
  highRank: (WinCount & { rate: number; adjusted: number }) | null;
  lane: (WinCount & { rate: number; adjusted: number; share: number }) | null;
  /** false when this hero's lane data was unavailable. */
  laneKnown: boolean;
  pro: (ProDraftHero & { drafts: number; windowDays: number; contestRate: number }) | null;
  trend: PickTrend | null;
}

/** Virtual games for shrinking high-rank win rates (samples are usually tens of thousands). */
export const PUBLIC_PRIOR_GAMES = 1_000;
/** Virtual games for shrinking lane win rates (samples are usually hundreds). */
export const LANE_PRIOR_GAMES = 100;
/** A hero must play this share of its games in the position's lane to count for it. */
export const MIN_LANE_SHARE = 0.25;
export const MIN_LANE_GAMES = 20;
/** Tournament data only counts once there are this many pro drafts in the window. */
export const MIN_PRO_DRAFTS = 20;

/**
 * Heroes a position can draw from, by catalog role (lane data narrows it further): supports
 * must be support heroes, safe-lane carries need the Carry tag, mid and offlane any core.
 * Lane data can't tell a core from the support beside it, so this split comes from roles.
 */
export function eligibleByRole(position: Position, roles: readonly string[]): boolean {
  const support = isSupportHero(roles);
  if (POSITION_INFO[position].side === "support") return support;
  return !support && (position !== 1 || roles.includes("Carry"));
}

/**
 * Rank heroes for a position. A hero is kept when it fits the position's catalog role and,
 * if its lane data is known, plays at least 25% of its games (and 20+ games) in that lane.
 *
 * Score = (adjusted high-rank win rate − 50%) + 0.75 × (adjusted lane win rate − 50%)
 *       + up to 3 points for being contested in tournaments + a small trend nudge.
 * Heroes with no public stats at all are left out rather than guessed.
 */
export function rankHeroes(
  position: Position,
  candidates: readonly HeroCandidate[],
  ctx: { pro: ProDrafts | null; allPicksTrend: readonly number[] },
): RankedHero[] {
  const info = POSITION_INFO[position];
  const proById = new Map(ctx.pro?.heroes.map((h) => [h.heroId, h]));
  const proUsable = ctx.pro !== null && ctx.pro.drafts >= MIN_PRO_DRAFTS;
  const out: RankedHero[] = [];

  for (const c of candidates) {
    if (!eligibleByRole(position, c.roles) || !c.publicStats || c.publicStats.games <= 0) continue;

    let lane: RankedHero["lane"] = null;
    if (c.lanes) {
      const inLane = c.lanes.get(info.laneRole) ?? { games: 0, wins: 0 };
      const total = [...c.lanes.values()].reduce((n, l) => n + l.games, 0);
      const share = total > 0 ? inLane.games / total : 0;
      if (share < MIN_LANE_SHARE || inLane.games < MIN_LANE_GAMES) continue;
      lane = {
        ...inLane,
        rate: inLane.wins / inLane.games,
        adjusted: shrunkRate(inLane.wins, inLane.games, LANE_PRIOR_GAMES),
        share,
      };
    }

    const p = c.publicStats;
    const highRank = {
      games: p.games,
      wins: p.wins,
      rate: p.wins / p.games,
      adjusted: shrunkRate(p.wins, p.games, PUBLIC_PRIOR_GAMES),
    };

    const proHero = proById.get(c.heroId);
    const pro =
      proUsable && ctx.pro
        ? {
            heroId: c.heroId,
            picks: proHero?.picks ?? 0,
            bans: proHero?.bans ?? 0,
            leagues: proHero?.leagues ?? 0,
            drafts: ctx.pro.drafts,
            windowDays: ctx.pro.windowDays,
            contestRate: Math.min(
              1,
              ((proHero?.picks ?? 0) + (proHero?.bans ?? 0)) / ctx.pro.drafts,
            ),
          }
        : null;

    const trend = pickTrend(p.pickTrend, ctx.allPicksTrend);
    const score =
      highRank.adjusted -
      0.5 +
      (lane ? 0.75 * (lane.adjusted - 0.5) : 0) +
      (pro ? 0.03 * pro.contestRate : 0) +
      (trend ? 0.01 * Math.max(-0.5, Math.min(0.5, trend.change)) : 0);

    out.push({ heroId: c.heroId, score, highRank, lane, laneKnown: c.lanes !== null, pro, trend });
  }

  return out.sort((a, b) => b.score - a.score || a.heroId - b.heroId);
}

/**
 * Which heroes to fetch lane data for: those that fit the position's catalog role, best
 * adjusted high-rank win rate first. Keeps upstream calls bounded.
 */
export function laneCandidates(
  position: Position,
  heroes: ReadonlyArray<{ id: number; roles: readonly string[] }>,
  stats: ReadonlyMap<number, HeroPublicStats>,
  limit: number,
): number[] {
  return heroes
    .filter((h) => eligibleByRole(position, h.roles) && (stats.get(h.id)?.games ?? 0) > 0)
    .map((h) => {
      const s = stats.get(h.id)!;
      return { id: h.id, adjusted: shrunkRate(s.wins, s.games, PUBLIC_PRIOR_GAMES) };
    })
    .sort((a, b) => b.adjusted - a.adjusted || a.id - b.id)
    .slice(0, limit)
    .map((h) => h.id);
}
