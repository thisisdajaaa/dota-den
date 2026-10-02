import {
  counters,
  PHASES,
  pickBenchmarks,
  topItems,
  type Benchmark,
  type Counter,
  type ItemPick,
  type MatchupRow,
  type Phase,
  type ProGame,
} from "../domain/hero-guide";

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

export interface HeroGuide {
  heroId: number;
  items: Record<Phase, ItemPick[]> | null;
  benchmarks: Benchmark[] | null;
  proGames: ProGame[] | null;
  counters: { strongAgainst: Counter[]; weakAgainst: Counter[] } | null;
}

const PRO_GAMES_SHOWN = 12;

export class GuideService {
  constructor(private readonly deps: { source: GuideSource }) {}

  /**
   * A hero's guide. Sections fail independently; `isConsumable` hides consumables (wards,
   * teleports, salves) after the starting items, where they'd crowd out the build.
   */
  async guide(heroId: number, isConsumable: (itemId: number) => boolean): Promise<HeroGuide> {
    const { source } = this.deps;
    const [pop, bench, allGames, matchups] = await Promise.all([
      source.itemPopularity(heroId).catch(() => null),
      source.benchmarks(heroId).catch(() => null),
      source.proGames(heroId).catch(() => null),
      source.matchups(heroId).catch(() => null),
    ]);
    const games = allGames?.slice(0, PRO_GAMES_SHOWN) ?? null;
    const ids = (games ?? []).flatMap((g) => (g.accountId32 ? [g.accountId32] : []));
    const names = ids.length ? await source.proNames(ids).catch(() => null) : null;
    const items = pop
      ? (Object.fromEntries(
          PHASES.map((p) => [p, topItems(pop[p] ?? {}, p === "start" ? undefined : isConsumable)]),
        ) as Record<Phase, ItemPick[]>)
      : null;
    return {
      heroId,
      items,
      benchmarks: bench ? pickBenchmarks(bench) : null,
      proGames: games
        ? games.map((g) => ({
            ...g,
            playerName:
              g.playerName ?? (g.accountId32 ? (names?.get(g.accountId32) ?? null) : null),
          }))
        : null,
      counters: matchups ? counters(matchups) : null,
    };
  }
}
