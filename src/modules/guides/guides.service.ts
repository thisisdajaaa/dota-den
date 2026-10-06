import {
  counters,
  PHASES,
  pickBenchmarks,
  topItems,
  type ItemPick,
  type Phase,
} from "./domain/hero-guide";
import type { GuideSource } from "./guides.ports";
import type { HeroGuide } from "./dtos/responses/hero-guide.dto";

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

  /**
   * The items pros buy most on a hero in the mid and late game (consumables left out), as
   * ranks: OpenDota gives purchase counts without the number of games, so no percentages.
   */
  async proCoreItems(
    heroId: number,
    isConsumable: (itemId: number) => boolean,
  ): Promise<Array<{ phase: "mid" | "late"; itemId: number; rank: number }> | null> {
    const pop = await this.deps.source.itemPopularity(heroId).catch(() => null);
    if (!pop) return null;
    return (["mid", "late"] as const).flatMap((phase) =>
      topItems(pop[phase] ?? {}, isConsumable, 4).map((it, i) => ({
        phase,
        itemId: it.itemId,
        rank: i + 1,
      })),
    );
  }
}
