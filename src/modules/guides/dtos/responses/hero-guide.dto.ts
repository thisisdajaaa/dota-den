import type { SkillBuild } from "../../domain/skill-build";
import type {
  Benchmark,
  BuildStep,
  Counter,
  ItemPick,
  ItemSource,
  MatchupSource,
  Phase,
  ProGame,
} from "../../domain/hero-guide";

export interface HeroGuide {
  heroId: number;
  items: Record<Phase, ItemPick[]> | null;
  /** Pubs only: the build laid out like the in-game guides (start, early, core, situational). */
  build: Record<BuildStep, ItemPick[]> | null;
  /** Skill order and talents from recent pro games; null when there aren't enough. */
  skills: SkillBuild | null;
  /** Where `items` come from (and, for pubs, which position they're for). */
  itemSource: ItemSource;
  benchmarks: Benchmark[] | null;
  proGames: ProGame[] | null;
  counters: { strongAgainst: Counter[]; weakAgainst: Counter[]; source: MatchupSource } | null;
}
