/**
 * What works for you on a hero (pure): win rates with and without each item, and from the
 * stored extras of your parsed games, item timings in wins vs losses and lane results by
 * role. Everything is counted from your games; each number carries its sample, and below the
 * minimums nothing is shown. These are correlations in your games, not causes.
 */

/** An item is compared only with this many games bought and this many not bought. */
export const MIN_ITEM_SPLIT = 5;
/** Item timings and lanes are shown once this many parsed games on the hero are analysed. */
export const MIN_ANALYSED_GAMES = 8;
/** A median timing is shown for wins (or losses) with at least this many games. */
export const MIN_TIMING_GAMES = 3;
/** Items with timings shown (your most common). */
export const MAX_TIMING_ITEMS = 5;

export interface SideRecord {
  games: number;
  wins: number;
  winRate: number;
}

export interface ItemImpact {
  key: string;
  /** Games (with purchase data) in which you bought it. */
  bought: SideRecord;
  /** Games (with purchase data) in which you didn't. */
  skipped: SideRecord;
  /** Win rate bought minus win rate skipped. */
  delta: number;
}

export interface ItemImpactView {
  /** Games with purchase data and a known result (the comparison's sample). */
  withData: number;
  minGames: number;
  rows: ItemImpact[];
}

const record = (games: number, wins: number): SideRecord => ({
  games,
  wins,
  winRate: games === 0 ? 0 : wins / games,
});

/**
 * For each completed item: your win rate in games you bought it against games you didn't.
 * Only games with purchase data (parsed replays) and a known result count. Items bought (or
 * skipped) in fewer than `minGames` games are left out. Biggest differences first.
 */
export function itemImpact(
  games: ReadonlyArray<{ purchase: Readonly<Record<string, number>> | null; won?: boolean | null }>,
  isItem: (key: string) => boolean,
  opts: { minGames?: number; limit?: number } = {},
): ItemImpactView {
  const minGames = opts.minGames ?? MIN_ITEM_SPLIT;
  const known = games.filter(
    (g): g is { purchase: Readonly<Record<string, number>>; won: boolean } =>
      g.purchase !== null && typeof g.won === "boolean",
  );
  const totalWins = known.filter((g) => g.won).length;
  const bought = new Map<string, { games: number; wins: number }>();
  for (const g of known) {
    for (const [key, n] of Object.entries(g.purchase)) {
      if (!(n > 0) || !isItem(key)) continue;
      const b = bought.get(key) ?? { games: 0, wins: 0 };
      b.games++;
      if (g.won) b.wins++;
      bought.set(key, b);
    }
  }
  const rows: ItemImpact[] = [];
  for (const [key, b] of bought) {
    const skippedGames = known.length - b.games;
    if (b.games < minGames || skippedGames < minGames) continue;
    const withIt = record(b.games, b.wins);
    const without = record(skippedGames, totalWins - b.wins);
    rows.push({ key, bought: withIt, skipped: without, delta: withIt.winRate - without.winRate });
  }
  return {
    withData: known.length,
    minGames,
    rows: rows
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.key.localeCompare(b.key))
      .slice(0, opts.limit ?? 6)
      .sort((a, b) => b.delta - a.delta || a.key.localeCompare(b.key)),
  };
}

/** Median of the values; null when there are none. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** One analysed parsed game (from the stored extras). */
export interface CoachingGame {
  result: "win" | "loss";
  laneRole: number | null;
  roaming: boolean;
  efficiencyPct: number | null;
  laneResult: "won" | "even" | "lost" | null;
  itemTimings: ReadonlyArray<{ key: string; time: number }>;
}

export interface TimingSide {
  /** Games on this side with the item bought. */
  games: number;
  /** Median first-purchase time (seconds); null under MIN_TIMING_GAMES. */
  median: number | null;
}

export interface ItemTimingRow {
  key: string;
  /** Analysed games in which you bought it. */
  games: number;
  wins: TimingSide;
  losses: TimingSide;
}

export interface LaneRoleRow {
  /** 1 safe lane, 2 mid, 3 off lane, 4 jungle. */
  laneRole: number;
  games: number;
  /** Game wins (not lane wins) in this role. */
  wins: number;
  /** Lane results by gold at 10 minutes; `compared` games had one (not roaming or jungle). */
  lane: { compared: number; won: number; even: number; lost: number };
  /** Median lane efficiency (0–100) and how many games had it. */
  efficiency: { median: number; games: number } | null;
}

export interface HeroCoaching {
  /** Parsed games on the hero with stored extras. */
  analysed: number;
  /** Your parsed games on the hero (imported), analysed or not. */
  parsedGames: number;
  minGames: number;
  /** false under MIN_ANALYSED_GAMES: timings and lanes are then empty. */
  enough: boolean;
  timings: ItemTimingRow[];
  lanes: LaneRoleRow[];
  /** Analysed games without a lane role. */
  noLaneRole: number;
}

function timingSide(times: number[], minGames: number): TimingSide {
  return { games: times.length, median: times.length >= minGames ? median(times) : null };
}

/** Typical item timings in wins vs losses, and lane results by role, from analysed games. */
export function heroCoaching(
  games: readonly CoachingGame[],
  parsedGames: number,
  isItem: (key: string) => boolean,
  opts: { minGames?: number; minTimingGames?: number; maxItems?: number } = {},
): HeroCoaching {
  const minGames = opts.minGames ?? MIN_ANALYSED_GAMES;
  const minTiming = opts.minTimingGames ?? MIN_TIMING_GAMES;
  const base = {
    analysed: games.length,
    parsedGames: Math.max(parsedGames, games.length),
    minGames,
  };
  if (games.length < minGames)
    return { ...base, enough: false, timings: [], lanes: [], noLaneRole: 0 };

  const times = new Map<string, { win: number[]; loss: number[] }>();
  for (const g of games) {
    for (const { key, time } of g.itemTimings) {
      if (!isItem(key)) continue;
      const t = times.get(key) ?? { win: [], loss: [] };
      t[g.result].push(time);
      times.set(key, t);
    }
  }
  const timings = [...times.entries()]
    .map(([key, t]) => ({
      key,
      games: t.win.length + t.loss.length,
      wins: timingSide(t.win, minTiming),
      losses: timingSide(t.loss, minTiming),
    }))
    .filter((r) => r.games >= minTiming)
    .sort((a, b) => b.games - a.games || a.key.localeCompare(b.key))
    .slice(0, opts.maxItems ?? MAX_TIMING_ITEMS);

  const roles = new Map<number, CoachingGame[]>();
  let noLaneRole = 0;
  for (const g of games) {
    if (g.laneRole === null || g.laneRole < 1 || g.laneRole > 4) {
      noLaneRole++;
      continue;
    }
    roles.set(g.laneRole, [...(roles.get(g.laneRole) ?? []), g]);
  }
  const lanes: LaneRoleRow[] = [...roles.entries()]
    .sort(([a], [b]) => a - b)
    .map(([laneRole, gs]) => {
      const lane = { compared: 0, won: 0, even: 0, lost: 0 };
      for (const g of gs) {
        if (!g.laneResult) continue;
        lane.compared++;
        lane[g.laneResult]++;
      }
      const eff = gs.flatMap((g) => (g.efficiencyPct === null ? [] : [g.efficiencyPct]));
      return {
        laneRole,
        games: gs.length,
        wins: gs.filter((g) => g.result === "win").length,
        lane,
        efficiency: eff.length > 0 ? { median: median(eff)!, games: eff.length } : null,
      };
    });

  return { ...base, enough: true, timings, lanes, noLaneRole };
}
