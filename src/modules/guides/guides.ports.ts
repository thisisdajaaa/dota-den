import type { MatchupRow, Phase, ProGame } from "./domain/hero-guide";

/** Where guide data comes from. Each call is null when that source is unavailable. */
export interface GuideSource {
  /** Item purchase counts per phase from professional games. */
  itemPopularity(heroId: number): Promise<Record<Phase, Record<string, number>> | null>;
  /** Percentile tables per stat, from recent public games on the hero. */
  benchmarks(
    heroId: number,
  ): Promise<Record<string, Array<{ percentile: number; value: number }>> | null>;
  /** Recent professional games on the hero, newest first (without player names). */
  proGames(heroId: number): Promise<ProGame[] | null>;
  /** Pro players' names for these accounts. */
  proNames(accountIds: readonly number[]): Promise<Map<number, string> | null>;
  /** How the hero does against each other hero in pro games. */
  matchups(heroId: number): Promise<MatchupRow[] | null>;
}
