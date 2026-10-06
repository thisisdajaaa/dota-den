import { advisePool, findNemeses, type MatchupTable } from "./domain/pool-advice";
import type { AdvisorSources } from "./advisor.ports";
import type { PoolAdviceView } from "./dtos/responses/pool-advice.dto";

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
