import type {
  Benchmark,
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
  /** Where `items` come from (and, for pubs, which position they're for). */
  itemSource: ItemSource;
  benchmarks: Benchmark[] | null;
  proGames: ProGame[] | null;
  counters: { strongAgainst: Counter[]; weakAgainst: Counter[]; source: MatchupSource } | null;
}
