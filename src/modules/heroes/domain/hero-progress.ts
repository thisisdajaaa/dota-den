/**
 * Progress on a hero (pure): the player's recent games split in two halves, earlier against
 * latest, plus a smoothed series per stat. Only their own public games; small samples aren't
 * shown at all.
 */

export interface ProgressGame {
  startedAt: Date;
  durationSec: number;
  won: boolean | null;
  goldPerMin: number | null;
  xpPerMin: number | null;
  lastHits: number | null;
  kills: number;
  deaths: number;
  assists: number;
}

export const PROGRESS_STATS = ["gpm", "xpm", "lhpm", "kda", "winRate"] as const;
export type ProgressStat = (typeof PROGRESS_STATS)[number];

export interface StatProgress {
  stat: ProgressStat;
  earlier: number;
  latest: number;
  /** latest − earlier, in the stat's units (win rate: 0–1). */
  change: number;
  /** Rolling average over ROLLING games, oldest first, for a sparkline. */
  series: number[];
}

export interface HeroProgress {
  games: number;
  /** Games in each half. */
  half: number;
  stats: StatProgress[];
}

export const MIN_PROGRESS_GAMES = 10;
export const PROGRESS_GAMES = 30;
const ROLLING = 5;

function value(g: ProgressGame, stat: ProgressStat): number | null {
  switch (stat) {
    case "gpm":
      return g.goldPerMin;
    case "xpm":
      return g.xpPerMin;
    case "lhpm":
      return g.lastHits !== null && g.durationSec > 0 ? g.lastHits / (g.durationSec / 60) : null;
    case "kda":
      return (g.kills + g.assists) / Math.max(1, g.deaths);
    case "winRate":
      return g.won === null ? null : g.won ? 1 : 0;
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Earlier half against latest half of the most recent games; null below the minimum. */
export function heroProgress(games: readonly ProgressGame[]): HeroProgress | null {
  const recent = [...games]
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .slice(-PROGRESS_GAMES);
  if (recent.length < MIN_PROGRESS_GAMES) return null;
  const half = Math.floor(recent.length / 2);
  const earlierGames = recent.slice(recent.length - 2 * half, recent.length - half);
  const latestGames = recent.slice(recent.length - half);
  const stats: StatProgress[] = [];
  for (const stat of PROGRESS_STATS) {
    const vals = (gs: readonly ProgressGame[]) =>
      gs.map((g) => value(g, stat)).filter((v): v is number => v !== null);
    const e = vals(earlierGames);
    const l = vals(latestGames);
    // Each half needs most of its games to have the stat.
    if (e.length < half * 0.6 || l.length < half * 0.6) continue;
    const all = vals(recent);
    const series = all.map((_, i) => mean(all.slice(Math.max(0, i - ROLLING + 1), i + 1)));
    const earlier = mean(e);
    const latest = mean(l);
    stats.push({ stat, earlier, latest, change: latest - earlier, series });
  }
  return { games: recent.length, half, stats };
}
