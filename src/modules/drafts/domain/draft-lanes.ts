/**
 * Laning (pure): how heroes do against each other in the lane itself, from pro games.
 *
 * Two heroes "met in lane" when they were on opposite teams in opposing lanes (safe lane
 * vs off lane, or mid vs mid). A lane is "won" by the side whose heroes in that lane had
 * more gold at 10 minutes. Samples are small, so every rate is damped toward even.
 */
import type { Position } from "./draft-positions";

/** Lane records keyed `${a}>${b}`: games where a met b in lane, and how often a's lane won. */
export type LaneTable = ReadonlyMap<string, { games: number; wins: number }>;

export const laneKey = (a: number, b: number) => `${a}>${b}`;

/** Pseudo-games of an even lane mixed into every record. */
const LANE_SHRINK_GAMES = 10;
/** Below this, a lane record is too thin to quote on its own. */
export const MIN_LANE_GAMES = 4;

export interface LaneRecord {
  games: number;
  wins: number;
  /** Damped lane win rate edge in percentage points (positive: a wins the lane). */
  edge: number;
}

export function laneRecord(a: number, b: number, lanes: LaneTable | undefined): LaneRecord | null {
  const direct = lanes?.get(laneKey(a, b));
  const reverse = lanes?.get(laneKey(b, a));
  // Either direction describes the same games; prefer the direct one.
  const rec =
    direct ?? (reverse ? { games: reverse.games, wins: reverse.games - reverse.wins } : null);
  if (!rec || rec.games < MIN_LANE_GAMES) return null;
  return {
    games: rec.games,
    wins: rec.wins,
    edge: ((rec.wins - rec.games / 2) / (rec.games + LANE_SHRINK_GAMES)) * 100,
  };
}

/** The enemy positions a hero at `position` lanes against. */
export function opposingPositions(position: Position): Position[] {
  switch (position) {
    case 1:
    case 5:
      return [3, 4];
    case 2:
      return [2];
    case 3:
    case 4:
      return [1, 5];
  }
}
