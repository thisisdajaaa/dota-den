import {
  counters,
  PHASES,
  pickBenchmarks,
  playedPositions,
  pubPhases,
  topItems,
  type ItemPick,
  type ItemSource,
  type Phase,
  type PubBuild,
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
  async guide(
    heroId: number,
    isConsumable: (itemId: number) => boolean,
    opts: { isFiller?: (itemId: number) => boolean; position?: number } = {},
  ): Promise<HeroGuide> {
    const { source } = this.deps;
    const builds = await (source.itemBuilds?.(heroId) ?? Promise.resolve(null)).catch(() => null);
    const pub = builds ? pubItems(builds, opts.isFiller ?? isConsumable, opts.position) : null;
    const [pop, bench, allGames, matchups] = await Promise.all([
      pub ? Promise.resolve(null) : source.itemPopularity(heroId).catch(() => null),
      source.benchmarks(heroId).catch(() => null),
      source.proGames(heroId).catch(() => null),
      source.matchups(heroId).catch(() => null),
    ]);
    const games = allGames?.slice(0, PRO_GAMES_SHOWN) ?? null;
    const ids = (games ?? []).flatMap((g) => (g.accountId32 ? [g.accountId32] : []));
    const names = ids.length ? await source.proNames(ids).catch(() => null) : null;
    const items =
      pub?.items ??
      (pop
        ? (Object.fromEntries(
            PHASES.map((p) => [
              p,
              topItems(pop[p] ?? {}, p === "start" ? undefined : isConsumable),
            ]),
          ) as Record<Phase, ItemPick[]>)
        : null);
    return {
      heroId,
      items,
      itemSource: pub?.itemSource ?? { source: "pro" },
      benchmarks: bench ? pickBenchmarks(bench) : null,
      proGames: games
        ? games.map((g) => ({
            ...g,
            playerName:
              g.playerName ?? (g.accountId32 ? (names?.get(g.accountId32) ?? null) : null),
          }))
        : null,
      counters: matchups ? { ...counters(matchups.rows), source: matchups.source } : null,
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

/**
 * The pub build for the asked position when the hero is really played there, else its most
 * played position; null when no position has enough games (the caller falls back to pros).
 */
function pubItems(
  builds: readonly PubBuild[],
  exclude: (itemId: number) => boolean,
  asked: number | undefined,
): { items: Record<Phase, ItemPick[]>; itemSource: ItemSource } | null {
  const positions = playedPositions(builds);
  const chosen = positions.find((p) => p.position === asked) ?? positions[0];
  const build = chosen && builds.find((b) => b.position === chosen.position);
  if (!chosen || !build) return null;
  return {
    items: pubPhases(build, exclude),
    itemSource: { source: "pubs", position: chosen.position, positions },
  };
}
