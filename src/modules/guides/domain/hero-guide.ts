/**
 * Hero guides (pure). Everything here is what pros and strong players actually did, as
 * OpenDota reports it; nothing is invented. Item popularity comes from professional games,
 * benchmarks from recent public games on the hero, split by percentile.
 */

export const PHASES = ["start", "early", "mid", "late"] as const;
export type Phase = (typeof PHASES)[number];

export interface ItemPick {
  itemId: number;
  /** Times bought in this phase across the recent pro games OpenDota analysed. */
  count: number;
  /** Relative to the phase's most-bought item (1 = the most bought). */
  relative: number;
}

export const BENCH_STATS = [
  "gold_per_min",
  "xp_per_min",
  "last_hits_per_min",
  "hero_damage_per_min",
  "tower_damage",
] as const;
export type BenchStat = (typeof BENCH_STATS)[number];

export interface Benchmark {
  stat: BenchStat;
  median: number;
  top10: number;
  top1: number;
}

export interface ProGame {
  matchId: string;
  startedAt: Date;
  durationSec: number;
  leagueName: string | null;
  accountId32: number | null;
  playerName: string | null;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
}

/** A phase's most-bought items, best first, skipping any the caller excludes. */
export function topItems(
  counts: Readonly<Record<string, number>>,
  exclude: (itemId: number) => boolean = () => false,
  limit = 6,
): ItemPick[] {
  const rows = Object.entries(counts)
    .map(([id, count]) => ({ itemId: Number(id), count }))
    .filter((r) => Number.isInteger(r.itemId) && r.count > 0 && !exclude(r.itemId))
    .sort((a, b) => b.count - a.count || a.itemId - b.itemId)
    .slice(0, limit);
  const top = rows[0]?.count ?? 1;
  return rows.map((r) => ({ ...r, relative: r.count / top }));
}

/** Median, top 10% and top 1% for each stat, from OpenDota's percentile table. */
export function pickBenchmarks(
  result: Readonly<Record<string, ReadonlyArray<{ percentile: number; value: number }>>>,
): Benchmark[] {
  const at = (rows: ReadonlyArray<{ percentile: number; value: number }>, p: number) =>
    rows.find((r) => Math.abs(r.percentile - p) < 1e-6)?.value;
  const out: Benchmark[] = [];
  for (const stat of BENCH_STATS) {
    const rows = result[stat];
    if (!rows) continue;
    const median = at(rows, 0.5);
    const top10 = at(rows, 0.9);
    const top1 = at(rows, 0.99);
    if (median === undefined || top10 === undefined || top1 === undefined) continue;
    out.push({ stat, median, top10, top1 });
  }
  return out;
}

export function proRecord(games: readonly ProGame[]): { games: number; wins: number } {
  return { games: games.length, wins: games.filter((g) => g.won).length };
}

const LABELS: Record<BenchStat, string> = {
  gold_per_min: "Gold per minute",
  xp_per_min: "XP per minute",
  last_hits_per_min: "Last hits per minute",
  hero_damage_per_min: "Hero damage per minute",
  tower_damage: "Tower damage",
};
export const benchLabel = (s: BenchStat) => LABELS[s];

export function formatBench(stat: BenchStat, v: number): string {
  if (stat === "last_hits_per_min") return v.toFixed(1);
  return Math.round(v).toLocaleString("en-US");
}

export interface MatchupRow {
  heroId: number;
  games: number;
  wins: number;
}

export interface Counter extends MatchupRow {
  /** Raw win rate against this hero. */
  rate: number;
}

/** Opponents need this many games before they count. */
export const MIN_MATCHUP_GAMES = 25;
const MATCHUP_PRIOR = 30;

/**
 * Who the hero beats and who beats it in pro games, ranked by a win rate pulled toward 50%
 * for small samples (so a 9–1 record can't top the list). Raw rates and game counts are kept
 * for display.
 */
export function counters(
  rows: readonly MatchupRow[],
  limit = 6,
): { strongAgainst: Counter[]; weakAgainst: Counter[] } {
  const damped = (r: MatchupRow) => (r.wins + MATCHUP_PRIOR / 2) / (r.games + MATCHUP_PRIOR);
  const usable = rows
    .filter((r) => r.games >= MIN_MATCHUP_GAMES && r.wins <= r.games)
    .map((r) => ({ ...r, rate: r.wins / r.games, score: damped(r) }));
  const strong = usable
    .filter((r) => r.score > 0.5)
    .sort((a, b) => b.score - a.score || b.games - a.games);
  const weak = usable
    .filter((r) => r.score < 0.5)
    .sort((a, b) => a.score - b.score || b.games - a.games);
  const strip = ({ score: _s, ...r }: (typeof usable)[number]): Counter => r;
  return {
    strongAgainst: strong.slice(0, limit).map(strip),
    weakAgainst: weak.slice(0, limit).map(strip),
  };
}
