/**
 * Hero guides (pure). Everything here is what pros and strong players actually did, as
 * STRATZ and OpenDota report it; nothing is invented. Item builds come from a week of
 * Legend–Immortal pubs per position (STRATZ), or from pro games (OpenDota) when STRATZ can't
 * answer; benchmarks from recent public games on the hero, split by percentile.
 */

export const PHASES = ["start", "early", "mid", "late"] as const;
export type Phase = (typeof PHASES)[number];

export interface ItemPick {
  itemId: number;
  /** Times bought in this phase (pro games), or games that bought it (pubs). */
  count: number;
  /** Relative to the phase's most-bought item (1 = the most bought). */
  relative: number;
  /** Pubs only: share of the games that bought it which were won. */
  winRate?: number;
  /** Pubs only: the minute by which half of its purchases were made. */
  minute?: number;
}

export type Position = 1 | 2 | 3 | 4 | 5;

/** One item at one position in pub games (from the item source). */
export interface PubItem {
  itemId: number;
  games: number;
  wins: number;
  minute: number | null;
}

/** A hero's pub games at one position, with what was bought. */
export interface PubBuild {
  position: Position;
  games: number;
  wins: number;
  items: readonly PubItem[];
  starting: readonly PubItem[];
}

/** Where the item lists come from. */
export type ItemSource =
  | {
      source: "pubs";
      position: Position;
      /** Positions the hero is really played in, most played first. */
      positions: { position: Position; games: number; share: number }[];
    }
  | { source: "pro" };

/** A position is offered when at least this share of the hero's games are played there… */
export const MIN_POSITION_SHARE = 0.1;
/** …and it has at least this many games. */
export const MIN_POSITION_GAMES = 1_000;
/** Items bought in fewer games than this share of the position's games are left out. */
const MIN_ITEM_SHARE = 0.02;
/** Phase boundaries in minutes (by the typical purchase minute). */
export const EARLY_UNTIL = 10;
export const MID_UNTIL = 25;

/** Positions worth a tab, most played first. */
export function playedPositions(
  builds: readonly PubBuild[],
): { position: Position; games: number; share: number }[] {
  const total = builds.reduce((n, b) => n + b.games, 0);
  if (total === 0) return [];
  return builds
    .map((b) => ({ position: b.position, games: b.games, share: b.games / total }))
    .filter((p) => p.share >= MIN_POSITION_SHARE && p.games >= MIN_POSITION_GAMES)
    .sort((a, b) => b.games - a.games);
}

/**
 * A position's build by phase: the starting items, then completed items by the minute they're
 * typically bought (early before 10, mid until 25, late after). Most-bought first; rarely
 * bought items and anything `exclude` names (consumables, plain components) are left out.
 */
export function pubPhases(
  build: PubBuild,
  exclude: (itemId: number) => boolean,
  limit = 6,
): Record<Phase, ItemPick[]> {
  const floor = Math.max(1, build.games * MIN_ITEM_SHARE);
  const pick = (rows: readonly PubItem[]): ItemPick[] => {
    const top = [...rows]
      .filter((r) => r.games >= floor && r.wins <= r.games)
      .sort((a, b) => b.games - a.games || a.itemId - b.itemId)
      .slice(0, limit);
    const most = top[0]?.games ?? 1;
    return top.map((r) => ({
      itemId: r.itemId,
      count: r.games,
      relative: r.games / most,
      winRate: r.wins / r.games,
      ...(r.minute === null ? {} : { minute: r.minute }),
    }));
  };
  const timed = build.items.filter((i) => i.minute !== null && !exclude(i.itemId));
  return {
    start: pick(build.starting),
    early: pick(timed.filter((i) => i.minute! < EARLY_UNTIL)),
    mid: pick(timed.filter((i) => i.minute! >= EARLY_UNTIL && i.minute! < MID_UNTIL)),
    late: pick(timed.filter((i) => i.minute! >= MID_UNTIL)),
  };
}

/**
 * Items that aren't part of a build list after the start: consumables, secret-shop parts and
 * plain components (a Blink Dagger, a component that's an item in its own right, stays).
 */
export function isBuildFiller(item: { qual: string | null; cost: number | null } | undefined) {
  if (!item) return false;
  if (item.qual === "consumable" || item.qual === "secret_shop") return true;
  return item.qual === "component" && (item.cost ?? 0) < 2_000;
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

/** Where a hero's matchups come from: the latest full week of Legend–Immortal pubs, or pro games. */
export type MatchupSource = "pubs" | "pro";

export interface Counter extends MatchupRow {
  /** Raw win rate against this hero. */
  rate: number;
}

/** Opponents need this many games before they count. */
export const MIN_MATCHUP_GAMES = 25;
const MATCHUP_PRIOR = 30;

/**
 * Who the hero beats and who beats it, ranked by a win rate pulled toward 50%
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
