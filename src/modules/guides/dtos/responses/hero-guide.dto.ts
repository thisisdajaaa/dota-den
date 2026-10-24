import type {
  Benchmark,
  Counter,
  ItemPick,
  MatchupSource,
  Phase,
  ProGame,
} from "../../domain/hero-guide";

export interface HeroGuide {
  heroId: number;
  items: Record<Phase, ItemPick[]> | null;
  benchmarks: Benchmark[] | null;
  proGames: ProGame[] | null;
  counters: { strongAgainst: Counter[]; weakAgainst: Counter[]; source: MatchupSource } | null;
}
