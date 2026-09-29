import { POSITION_INFO, type Position } from "./position";
import { shrunkRate } from "./meta-stats";

/** Two heroes on the same team in the same lane, from pro matches. */
export interface DuoRow {
  heroA: number;
  heroB: number;
  /** Lane role of the pair (1 safe lane, 3 off lane). */
  laneRole: number;
  games: number;
  wins: number;
}

export interface RankedDuo extends DuoRow {
  rate: number;
  adjusted: number;
}

export const DUO_MIN_GAMES = 8;
/** Virtual even games for shrinking duo win rates (pro samples are small). */
export const DUO_PRIOR_GAMES = 10;

export type DuoResult =
  { kind: "solo_lane" } | { kind: "duos"; laneRole: 1 | 3; duos: RankedDuo[] };

/**
 * Best lane pairs for a position's lane: safe lane for pos 1/5, off lane for pos 3/4. Mid is
 * a solo lane, so it has no duos. Pairs under 8 games are dropped; the rest are ordered by
 * win rate pulled toward 50% for small samples, then by games.
 */
export function duosForPosition(
  rows: readonly DuoRow[],
  position: Position,
  opts: { limit?: number; minGames?: number } = {},
): DuoResult {
  const laneRole = POSITION_INFO[position].laneRole;
  if (laneRole === 2) return { kind: "solo_lane" };
  const minGames = opts.minGames ?? DUO_MIN_GAMES;
  const duos = rows
    .filter(
      (r) => r.laneRole === laneRole && r.games >= minGames && r.wins >= 0 && r.wins <= r.games,
    )
    .map((r) => ({
      ...r,
      rate: r.wins / r.games,
      adjusted: shrunkRate(r.wins, r.games, DUO_PRIOR_GAMES),
    }))
    .sort((a, b) => b.adjusted - a.adjusted || b.games - a.games || a.heroA - b.heroA)
    .slice(0, opts.limit ?? 8);
  return { kind: "duos", laneRole, duos };
}
