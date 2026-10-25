/**
 * "Pick for me" (pure): during a real ranked draft, rank the heroes the player actually plays
 * against the enemy picks. Every number shown is one of the inputs or a sum of them; there is
 * no win probability (we don't have one for real games).
 *
 * A candidate's score, in win-rate points:
 * - you: your win rate on the hero, pulled toward 50% on small samples;
 * - counters: for each enemy pick, how much better than its usual the hero does against it
 *   in high-rank pubs (STRATZ), pulled toward 0 on small samples;
 * - with allies: the same for each ally already picked, at half weight (it matters less).
 */

export type Position = 1 | 2 | 3 | 4 | 5;

/** Your record on a hero (all your imported games). */
export interface PoolHero {
  heroId: number;
  games: number;
  wins: number;
}

/** A hero's week in high-rank pubs: overall, and against / with each other hero. */
export interface HeroRecords {
  games: number;
  wins: number;
  vs: ReadonlyMap<number, { games: number; wins: number }>;
  with: ReadonlyMap<number, { games: number; wins: number }>;
}

export interface PickInput {
  pool: readonly PoolHero[];
  enemies: readonly number[];
  allies: readonly number[];
  /** Banned or otherwise taken (enemies and allies are excluded too). */
  unavailable: readonly number[];
  /** Your position, when you pick one: heroes rarely played there are left out. */
  position: Position | null;
  records: (heroId: number) => HeroRecords | undefined;
  /** Share of the hero's high-rank games at this position (0..1), when known. */
  positionShare: (heroId: number, position: Position) => number | null;
}

export interface Edge {
  heroId: number;
  /** Win-rate points (after shrinking), positive when good for you. */
  points: number;
  games: number;
}

export interface PickSuggestion {
  heroId: number;
  score: number;
  you: { games: number; wins: number; points: number };
  counters: Edge[];
  allies: Edge[];
  /** Share of the hero's high-rank games at your position, when you chose one. */
  positionShare: number | null;
}

/** Heroes you've played fewer times than this aren't "your" heroes yet. */
export const MIN_POOL_GAMES = 3;
/** Your win rate is pulled toward 50% as if you'd also played this many even games. */
const YOU_PRIOR_GAMES = 20;
/** A head-to-head record needs this many games to count at all. */
export const MIN_PAIR_GAMES = 50;
/** Pair records are pulled toward 0 with this many games' weight. */
const PAIR_SHRINK_GAMES = 300;
/** At your position, a hero needs at least this share of its games there. */
export const MIN_POSITION_SHARE = 0.1;
/** Allies count half as much as enemies. */
const ALLY_WEIGHT = 0.5;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** How much better than usual `hero` does in `pair` (win-rate points, shrunk), or null. */
function pairEdge(
  pair: { games: number; wins: number } | undefined,
  overall: number,
): { points: number; games: number } | null {
  if (!pair || pair.games < MIN_PAIR_GAMES || pair.wins > pair.games) return null;
  const raw = (pair.wins / pair.games - overall) * 100;
  return { points: (raw * pair.games) / (pair.games + PAIR_SHRINK_GAMES), games: pair.games };
}

/** Your heroes ranked for this draft, best first. */
export function pickForMe(input: PickInput, limit = 5): PickSuggestion[] {
  const taken = new Set([...input.enemies, ...input.allies, ...input.unavailable]);
  const out: PickSuggestion[] = [];
  for (const h of input.pool) {
    if (h.games < MIN_POOL_GAMES || taken.has(h.heroId) || h.wins > h.games) continue;
    const share = input.position === null ? null : input.positionShare(h.heroId, input.position);
    if (input.position !== null && share !== null && share < MIN_POSITION_SHARE) continue;

    const youPoints = ((h.wins + YOU_PRIOR_GAMES / 2) / (h.games + YOU_PRIOR_GAMES) - 0.5) * 100;
    const rec = input.records(h.heroId);
    const overall = rec && rec.games > 0 ? rec.wins / rec.games : 0.5;
    const edges = (ids: readonly number[], table: "vs" | "with") =>
      ids.flatMap((id) => {
        const e = rec ? pairEdge(rec[table].get(id), overall) : null;
        return e ? [{ heroId: id, points: round1(e.points), games: e.games }] : [];
      });
    const counters = edges(input.enemies, "vs");
    const allies = edges(input.allies, "with");
    const score =
      youPoints +
      counters.reduce((n, e) => n + e.points, 0) +
      ALLY_WEIGHT * allies.reduce((n, e) => n + e.points, 0);
    out.push({
      heroId: h.heroId,
      score: round1(score),
      you: { games: h.games, wins: h.wins, points: round1(youPoints) },
      counters,
      allies,
      positionShare: share,
    });
  }
  return out
    .sort((a, b) => b.score - a.score || b.you.games - a.you.games || a.heroId - b.heroId)
    .slice(0, limit);
}
