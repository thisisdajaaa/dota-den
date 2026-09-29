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
