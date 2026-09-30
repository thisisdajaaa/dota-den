/**
 * Teammate stats from the upstream's per-player "peers" counts (same team / other team,
 * all public matches). Same team is not the same as queued together: the copy says so.
 */

/** Games on the same team before a win rate is compared or ranked. */
export const MIN_TEAMMATE_GAMES = 10;
/** Your games without a teammate needed for "your usual" win rate. */
export const MIN_USUAL_GAMES = 10;
/** Prior strength (in games) when shrinking a teammate's win rate toward your usual. */
export const SHRINK_GAMES = 10;
/** Games against someone before they can be a "rival". */
export const MIN_RIVAL_GAMES = 3;
/** Recent own games looked at for the party/solo/unknown split. */
export const RECENT_QUEUE_GAMES = 20;

export interface PeerRecord {
  accountId32: number;
  withGames: number;
  withWins: number;
  againstGames: number;
  againstWins: number;
  lastPlayedAt: Date | null;
}

export interface WinLossTotals {
  games: number;
  wins: number;
}

export interface TeammateStat extends PeerRecord {
  /** Win rate on the same team; null without games. */
  winRate: number | null;
  /** Your win rate in games without them; null when too few such games. */
  usualRate: number | null;
  /** winRate − usualRate; null below the sample thresholds (never a guessed number). */
  delta: number | null;
  /** Fewer than MIN_TEAMMATE_GAMES together. */
  lowSample: boolean;
}

const rate = (wins: number, games: number): number | null => (games > 0 ? wins / games : null);

/** Your record in games without this teammate (all-time totals minus theirs, never negative). */
export function usualWithout(overall: WinLossTotals, p: PeerRecord): WinLossTotals | null {
  const games = overall.games - p.withGames;
  const wins = overall.wins - p.withWins;
  // Inconsistent upstream counts (theirs exceed yours): no baseline rather than a made-up one.
  if (games < 0 || wins < 0 || wins > games) return null;
  return { games, wins };
}

/** People you've had on your team, with win rate together vs your usual. */
export function teammateStats(
  peers: readonly PeerRecord[],
  overall: WinLossTotals | null,
): TeammateStat[] {
  return peers
    .filter((p) => p.withGames > 0)
    .map((p) => {
      const winRate = rate(p.withWins, p.withGames);
      const usual = overall ? usualWithout(overall, p) : null;
      const usualRate = usual && usual.games >= MIN_USUAL_GAMES ? usual.wins / usual.games : null;
      const lowSample = p.withGames < MIN_TEAMMATE_GAMES;
      return {
        ...p,
        winRate,
        usualRate,
        delta: !lowSample && winRate !== null && usualRate !== null ? winRate - usualRate : null,
        lowSample,
      };
    });
}

export type TeammateSort = "games" | "winrate" | "recent";

/**
 * Sort for display. "winrate" only ranks teammates with enough games (others are left out,
 * like the hero pool), so one lucky game doesn't top the list.
 */
export function sortTeammates<T extends TeammateStat>(xs: readonly T[], sort: TeammateSort): T[] {
  const time = (d: Date | null) => d?.getTime() ?? 0;
  const byGames = (a: T, b: T) =>
    b.withGames - a.withGames || time(b.lastPlayedAt) - time(a.lastPlayedAt);
  switch (sort) {
    case "games":
      return [...xs].sort(byGames);
    case "recent":
      return [...xs].sort((a, b) => time(b.lastPlayedAt) - time(a.lastPlayedAt) || byGames(a, b));
    case "winrate":
      return xs
        .filter((x) => !x.lowSample)
        .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || byGames(a, b));
  }
}

/**
 * Win rate pulled toward a baseline by SHRINK_GAMES imaginary games at the baseline rate.
 * With few games it stays near the baseline; with many it approaches the raw rate.
 */
export function shrunkRate(wins: number, games: number, baseline: number): number {
  return (wins + SHRINK_GAMES * baseline) / (games + SHRINK_GAMES);
}

export interface BestTeammate {
  teammate: TeammateStat;
  /** Shrunk win rate used for ranking. */
  adjustedRate: number;
  /** The rate it was shrunk toward. */
  baselineRate: number;
}

/**
 * Highest win rate together among teammates with MIN_TEAMMATE_GAMES+, after shrinking each
 * toward your usual win rate (without them, else overall). null without an overall record.
 */
export function bestTeammate(
  stats: readonly TeammateStat[],
  overall: WinLossTotals | null,
): BestTeammate | null {
  const overallRate = overall ? rate(overall.wins, overall.games) : null;
  let best: BestTeammate | null = null;
  for (const t of stats) {
    if (t.lowSample) continue;
    const baselineRate = t.usualRate ?? overallRate;
    if (baselineRate === null) continue;
    const adjustedRate = shrunkRate(t.withWins, t.withGames, baselineRate);
    if (
      !best ||
      adjustedRate > best.adjustedRate ||
      (adjustedRate === best.adjustedRate && t.withGames > best.teammate.withGames)
    )
      best = { teammate: t, adjustedRate, baselineRate };
  }
  return best;
}

export function mostPlayedWith<T extends PeerRecord>(stats: readonly T[]): T | null {
  return (
    [...stats]
      .filter((t) => t.withGames > 0)
      .sort((a, b) => b.withGames - a.withGames || a.accountId32 - b.accountId32)[0] ?? null
  );
}

/**
 * Rivals: people you've faced at least MIN_RIVAL_GAMES times and more often than you've
 * teamed with them. Most games against first.
 */
export function rivals<T extends PeerRecord>(peers: readonly T[], limit = 3): T[] {
  return peers
    .filter((p) => p.againstGames >= MIN_RIVAL_GAMES && p.againstGames > p.withGames)
    .sort(
      (a, b) =>
        b.againstGames - a.againstGames ||
        (b.lastPlayedAt?.getTime() ?? 0) - (a.lastPlayedAt?.getTime() ?? 0),
    )
    .slice(0, limit);
}

export interface QueueMix {
  games: number;
  party: number;
  solo: number;
  /** No party data: never assumed solo. */
  unknown: number;
}

/** Party/solo/unknown split of your most recent games (input newest first). */
export function recentQueueMix(
  games: ReadonlyArray<{ queueClass: "solo" | "party" | "unknown" }>,
  n = RECENT_QUEUE_GAMES,
): QueueMix {
  const recent = games.slice(0, n);
  const count = (q: string) => recent.filter((g) => g.queueClass === q).length;
  return {
    games: recent.length,
    party: count("party"),
    solo: count("solo"),
    unknown: count("unknown"),
  };
}
