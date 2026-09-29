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
}

export function parseRankTier(rankTier: number | null | undefined): RankTier | null {
  if (!rankTier || !Number.isInteger(rankTier)) return null;
  const medalIndex = Math.floor(rankTier / 10) - 1;
  const stars = rankTier % 10;
  const medal = MEDALS[medalIndex];
  if (!medal || stars > 5) return null;
  return { medal, stars: medal === "Immortal" ? 0 : stars };
}
