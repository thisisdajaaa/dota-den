/** Dota rank_tier: tens digit = medal (1 Herald … 8 Immortal), ones digit = stars (1–5). */
export const MEDALS = [
  "Herald",
  "Guardian",
  "Crusader",
  "Archon",
  "Legend",
  "Ancient",
  "Divine",
  "Immortal",
] as const;

export type Medal = (typeof MEDALS)[number];

export interface RankTier {
  medal: Medal;
  /** 0 for Immortal, which has no stars. */
  stars: number;
  /** Immortal only: leaderboard position (1 = best), when listed. */
  leaderboardRank: number | null;
}

export function parseRankTier(
  rankTier: number | null | undefined,
  leaderboardRank?: number | null,
): RankTier | null {
  if (!rankTier || !Number.isInteger(rankTier)) return null;
  const medalIndex = Math.floor(rankTier / 10) - 1;
  const stars = rankTier % 10;
  const medal = MEDALS[medalIndex];
  if (!medal || stars > 5) return null;
  const immortal = medal === "Immortal";
  return {
    medal,
    stars: immortal ? 0 : stars,
    // A leaderboard position only means something for Immortal players.
    leaderboardRank:
      immortal && leaderboardRank && Number.isInteger(leaderboardRank) && leaderboardRank > 0
        ? leaderboardRank
        : null,
  };
}

/**
 * Average medal of the ranked players in a match (rank_tier averaged, then rounded).
 * Null when nobody's rank is public. Leaderboard positions aren't averaged.
 */
export function averageRankTier(
  rankTiers: ReadonlyArray<number | null>,
): { rank: RankTier; ranked: number } | null {
  const valid = rankTiers.filter((t): t is number => parseRankTier(t) !== null);
  if (valid.length === 0) return null;
  // Immortal has no stars; count it as tier 80 like the other medals' "x0".
  const mean = valid.reduce((a, t) => a + t, 0) / valid.length;
  const medal = Math.min(8, Math.max(1, Math.floor(mean / 10)));
  const stars = medal === 8 ? 0 : Math.min(5, Math.max(1, Math.round(mean - medal * 10)));
  const rank = parseRankTier(medal * 10 + (medal === 8 ? 0 : stars));
  return rank ? { rank, ranked: valid.length } : null;
}
