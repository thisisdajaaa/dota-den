import {
  advisePool,
  findNemeses,
  type Advice,
  type Candidate,
  type MatchupTable,
  type Nemesis,
  type PoolRow,
} from "../domain/pool-advice";

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

export type PoolAdviceView =
  | { status: "ok"; position: Position; windowDays: number; nemeses: Nemesis[]; advice: Advice[] }
  | { status: "no_role" | "unavailable" };

export const WINDOW_DAYS = 180;
/** Meta heroes considered for each suggestion list. */
const CANDIDATES = 15;

export class AdvisorService {
  constructor(private readonly sources: AdvisorSources) {}

  async poolAdvice(accountId32: number): Promise<PoolAdviceView> {
    const [position, rows] = await Promise.all([
      this.sources.role(accountId32).catch(() => null),
      this.sources.poolRows(accountId32, WINDOW_DAYS).catch(() => null),
    ]);
    if (!position) return { status: "no_role" };
    const ranked = await this.sources.candidates(position).catch(() => null);
    if (!ranked || !rows) return { status: "unavailable" };

    const candidates = ranked.slice(0, CANDIDATES);
    const nemeses = findNemeses(rows);
    // Matchup tables only matter when there's someone to counter.
    const tables = nemeses.length
      ? await Promise.all(
          candidates.map(
            async (c) =>
              [c.heroId, await this.sources.matchups(c.heroId).catch(() => null)] as const,
          ),
        )
      : [];
    const matchups = new Map<number, MatchupTable>();
    for (const [id, t] of tables) if (t) matchups.set(id, t);

    return {
      status: "ok",
      position,
      windowDays: WINDOW_DAYS,
      nemeses,
      advice: advisePool({ candidates, pool: rows, nemeses, matchups }),
    };
  }
}
