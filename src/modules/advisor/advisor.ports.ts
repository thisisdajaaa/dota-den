import type { Candidate, MatchupTable, PoolRow } from "./domain/pool-advice";

/** Positions 1 (safe lane carry) to 5 (hard support), as the meta page uses them. */
export type Position = 1 | 2 | 3 | 4 | 5;

/** Where the advice comes from. Null means that source is unavailable right now. */
export interface AdvisorSources {
  /** Your heroes and results against each hero, over the last `days` days. */
  poolRows(accountId32: number, days: number): Promise<PoolRow[] | null>;
  /** How a hero does against others (pro games). */
  matchups(heroId: number): Promise<MatchupTable | null>;
  /** Your usual position from recent lanes, or null when unclear. */
  role(accountId32: number): Promise<Position | null>;
  /** Heroes ranked for a position by the meta page, strongest first. */
  candidates(position: Position): Promise<Candidate[] | null>;
}
