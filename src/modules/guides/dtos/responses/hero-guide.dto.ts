import type { Benchmark, Counter, ItemPick, Phase, ProGame } from "../../domain/hero-guide";

export interface HeroGuide {
  heroId: number;
  items: Record<Phase, ItemPick[]> | null;
  benchmarks: Benchmark[] | null;
  proGames: ProGame[] | null;
  counters: { strongAgainst: Counter[]; weakAgainst: Counter[] } | null;
}
