import type { MatchupRow, MatchupSource, Phase, ProGame, PubBuild } from "./domain/hero-guide";
import type { AbilityRef, TalentRef } from "./domain/skill-build";
import type { WardCell } from "./domain/ward-spots";

/** Where guide data comes from. Each call is null when that source is unavailable. */
export interface GuideSource {
  /** Pub item builds per position (STRATZ); absent or null when unavailable. */
  itemBuilds?(heroId: number): Promise<PubBuild[] | null>;
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
  /**
   * Skill orders (ability ids, one per point) from recent pro games on the hero, with the
   * hero's abilities and talents; absent or null when unavailable.
   */
  skillBuilds?(heroId: number): Promise<{
    builds: number[][];
    abilities: AbilityRef[];
    talents: TalentRef[];
  } | null>;
  /** Ward placements in recent pro games, counted per map cell; absent or null when unavailable. */
  wardCells?(): Promise<{ cells: WardCell[]; games: number } | null>;
  /** How the hero does against each other hero, and which games that's from. */
  matchups(heroId: number): Promise<{ rows: MatchupRow[]; source: MatchupSource } | null>;
}
