/**
 * Ranked this week, for you and your friends (pure). Public match data only: wins and losses
 * in ranked games over the last 7 days. No MMR: Valve doesn't share it, and the MMR players
 * log here stays private to them, so the net is the labelled ±25-per-game estimate.
 */

export const RANKED_WEEK_DAYS = 7;
export const ESTIMATE_PER_GAME = 25;
/** You plus at most this many friends (tracked players first, then frequent teammates). */
export const MAX_RANKED_WEEK_FRIENDS = 15;

export interface RankedWeekInput {
  accountId32: number;
  wins: number;
  losses: number;
  /** Hero with the most wins this week (2+ games), if any. */
  bestHero: { heroId: number; games: number; wins: number } | null;
}

export interface RankedWeekRow extends RankedWeekInput {
  games: number;
  winRate: number;
  /** Estimate: ±25 per ranked game, never a real MMR change. */
  estimatedNet: number;
  rank: number;
}

/** Players who played ranked this week, best net first; plus how many didn't. */
export function rankWeek(inputs: readonly RankedWeekInput[]): {
  rows: RankedWeekRow[];
  idle: number[];
} {
  const played = inputs.filter((i) => i.wins + i.losses > 0);
  const sorted = played
    .map((i) => {
      const games = i.wins + i.losses;
      return {
        ...i,
        games,
        winRate: i.wins / games,
        estimatedNet: (i.wins - i.losses) * ESTIMATE_PER_GAME,
        rank: 0,
      };
    })
    .sort(
      (a, b) =>
        b.wins - b.losses - (a.wins - a.losses) ||
        b.winRate - a.winRate ||
        b.games - a.games ||
        a.accountId32 - b.accountId32,
    );
  // Ties share a rank (same net and win rate).
  let rank = 0;
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.wins - prev.losses !== r.wins - r.losses || prev.winRate !== r.winRate)
      rank = i + 1;
    r.rank = rank;
  });
  return {
    rows: sorted,
    idle: inputs.filter((i) => i.wins + i.losses === 0).map((i) => i.accountId32),
  };
}

/** The hero with the most wins (at least 2 games), from per-hero records. */
export function bestHeroOf(
  heroes: readonly { heroId: number; games: number; wins: number }[],
): RankedWeekInput["bestHero"] {
  return (
    [...heroes]
      .filter((h) => h.games >= 2)
      .sort(
        (a, b) => b.wins - a.wins || b.wins / b.games - a.wins / a.games || b.games - a.games,
      )[0] ?? null
  );
}
