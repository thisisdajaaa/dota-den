/**
 * Hero pool advice (pure): heroes worth adding for your role, from what's strong at high ranks
 * and what beats the heroes you lose to most. Every reason is a real count or rate; small
 * samples are pulled toward 50% so a handful of games can't drive a suggestion.
 */

export interface PoolRow {
  heroId: number;
  /** Your games on this hero. */
  games: number;
  wins: number;
  /** Your games against this hero, and how many you won. */
  againstGames: number;
  againstWins: number;
}

/** A hero ranked for your position by the meta page (strongest first). */
export interface Candidate {
  heroId: number;
  /** High-rank win rate, already pulled toward 50% for its sample. */
  highRank: { rate: number; games: number } | null;
  /** Share of recent pro drafts it was picked or banned in. */
  contestRate: number | null;
}

/** Results of heroes against others (e.g. pro games): opponent id → games and wins. */
export type MatchupTable = ReadonlyMap<number, { games: number; wins: number }>;

export interface Nemesis {
  heroId: number;
  games: number;
  /** Your loss rate against it, pulled toward 50%. */
  lossRate: number;
}

export interface CounterReason {
  nemesisId: number;
  /** Candidate's games and win rate against the nemesis. */
  games: number;
  winRate: number;
  /** Your loss rate against the nemesis. */
  yourLossRate: number;
}

export interface Advice {
  heroId: number;
  highRank: Candidate["highRank"];
  contestRate: number | null;
  counters: CounterReason[];
  /** Your own games on it, if any (fewer than the "already in your pool" threshold). */
  yourGames: number;
  score: number;
}

/** Games you need against a hero before it can count as a nemesis. */
export const MIN_NEMESIS_GAMES = 15;
/** Games a hero needs against a nemesis before the result counts. */
export const MIN_COUNTER_GAMES = 20;
/** At this many recent games a hero is already in your pool. */
export const POOL_GAMES = 8;
const NEMESIS_PRIOR = 20;
const COUNTER_PRIOR = 20;

const damp = (hits: number, games: number, prior: number) => (hits + prior * 0.5) / (games + prior);

/** Heroes you lose to most (pulled toward 50%), worst first, only if clearly losing. */
export function findNemeses(rows: readonly PoolRow[], top = 5): Nemesis[] {
  return rows
    .filter((r) => r.againstGames >= MIN_NEMESIS_GAMES)
    .map((r) => ({
      heroId: r.heroId,
      games: r.againstGames,
      lossRate: damp(r.againstGames - r.againstWins, r.againstGames, NEMESIS_PRIOR),
    }))
    .filter((n) => n.lossRate > 0.52)
    .sort((a, b) => b.lossRate - a.lossRate || b.games - a.games)
    .slice(0, top);
}

/**
 * Up to `limit` heroes to add. Base: the candidate's place in the meta ranking. Bonus: a
 * winning record against your nemeses, weighted by how badly each one beats you.
 */
export function advisePool(input: {
  candidates: readonly Candidate[];
  pool: readonly PoolRow[];
  nemeses: readonly Nemesis[];
  matchups: ReadonlyMap<number, MatchupTable>;
  limit?: number;
}): Advice[] {
  const played = new Map(input.pool.map((r) => [r.heroId, r.games]));
  const nemesisIds = new Set(input.nemeses.map((n) => n.heroId));
  const pool = input.candidates.filter(
    (c) => (played.get(c.heroId) ?? 0) < POOL_GAMES && !nemesisIds.has(c.heroId),
  );
  const n = pool.length;
  const scored = pool.map((c, i) => {
    const table = input.matchups.get(c.heroId);
    const counters: CounterReason[] = [];
    let bonus = 0;
    for (const nem of input.nemeses) {
      const row = table?.get(nem.heroId);
      if (!row || row.games < MIN_COUNTER_GAMES) continue;
      const rate = damp(row.wins, row.games, COUNTER_PRIOR);
      // A clear counter to a hero that beats you often is worth several places in the ranking.
      bonus += (rate - 0.5) * (nem.lossRate - 0.5) * 60;
      if (rate > 0.5) {
        counters.push({
          nemesisId: nem.heroId,
          games: row.games,
          winRate: row.wins / row.games,
          yourLossRate: nem.lossRate,
        });
      }
    }
    return {
      heroId: c.heroId,
      highRank: c.highRank,
      contestRate: c.contestRate,
      counters: counters.sort((a, b) => b.winRate - a.winRate),
      yourGames: played.get(c.heroId) ?? 0,
      score: (n - i) / n + bonus,
    };
  });
  return scored.sort((a, b) => b.score - a.score || a.heroId - b.heroId).slice(0, input.limit ?? 3);
}
