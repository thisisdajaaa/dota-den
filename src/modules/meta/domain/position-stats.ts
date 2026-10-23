/**
 * Per-position public stats (STRATZ): how often each hero is played at each position and how
 * it does there. Unlike OpenDota's lane roles, these tell a Pos 3 from a Pos 4 and a Pos 1
 * from a Pos 5, so they place heroes without the catalog's role tags.
 */
import type { WinCount } from "./meta-stats";
import { POSITIONS, type Position } from "./position";

export type PositionCounts = Readonly<Record<Position, WinCount>>;

export interface PositionStats {
  /** Games and wins per position, per hero. */
  heroes: ReadonlyMap<number, PositionCounts>;
  /** First and last UTC day the counts cover (YYYY-MM-DD), and how many days that is. */
  window: { from: string; to: string; days: number };
}

/**
 * A hero counts for a position when at least this share of its games are there. 15% is about
 * one game in seven: a real, regular role (Pudge at Pos 3, Earthshaker at Pos 4), not the odd
 * game someone queued into. Flex heroes can count for several positions.
 */
export const MIN_POSITION_SHARE = 0.15;
/**
 * …and when it has at least this many games there in the window. At 1,000 games a win rate's
 * standard error is about ±1.6 points; in a week of Ancient–Immortal games even the least
 * played hero has about 5,000 games in all, so this only drops rare off-role picks.
 */
export const MIN_POSITION_GAMES = 1_000;

export interface PositionRecord extends WinCount {
  position: Position;
  /** Share of the hero's games (over all five positions) played at this position. */
  share: number;
}

function total(counts: PositionCounts): number {
  return POSITIONS.reduce((n, p) => n + counts[p].games, 0);
}

/** The hero's record at one position, or null when it has no games at all. */
export function positionRecord(
  stats: PositionStats,
  heroId: number,
  position: Position,
): PositionRecord | null {
  const counts = stats.heroes.get(heroId);
  if (!counts) return null;
  const all = total(counts);
  if (all <= 0) return null;
  const at = counts[position];
  return { position, games: at.games, wins: at.wins, share: at.games / all };
}

/** Whether a record clears both thresholds for its position. */
export function playsPosition(record: PositionRecord | null): record is PositionRecord {
  return (
    record !== null && record.share >= MIN_POSITION_SHARE && record.games >= MIN_POSITION_GAMES
  );
}

/** Heroes that really play this position, by the thresholds above, most played first. */
export function positionCandidates(
  stats: PositionStats,
  position: Position,
): Array<PositionRecord & { heroId: number }> {
  const out: Array<PositionRecord & { heroId: number }> = [];
  for (const heroId of stats.heroes.keys()) {
    const r = positionRecord(stats, heroId, position);
    if (playsPosition(r)) out.push({ ...r, heroId });
  }
  return out.sort((a, b) => b.games - a.games || a.heroId - b.heroId);
}

/** Share of the hero's games played at any of these positions (0 when unknown). */
export function shareAt(
  stats: PositionStats,
  heroId: number,
  positions: readonly Position[],
): number {
  const counts = stats.heroes.get(heroId);
  if (!counts) return 0;
  const all = total(counts);
  if (all <= 0) return 0;
  return positions.reduce((n, p) => n + counts[p].games, 0) / all;
}

/** The position the hero is played at most; null when it has no games. Ties: lower number. */
export function mainPosition(stats: PositionStats, heroId: number): Position | null {
  const counts = stats.heroes.get(heroId);
  if (!counts || total(counts) <= 0) return null;
  let best: Position = 1;
  for (const p of POSITIONS) if (counts[p].games > counts[best].games) best = p;
  return best;
}
