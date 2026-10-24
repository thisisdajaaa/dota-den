import type { StratzHeroMatchups } from "@/common/providers/stratz-hero-matchups";
import type { GuideSource } from "../guides.ports";
import type { MatchupRow, MatchupSource } from "../domain/hero-guide";

/**
 * Guide data with matchups from STRATZ (the latest full week of Legend–Immortal pubs) instead of OpenDota's
 * pro-only ones. Everything else, and matchups STRATZ can't answer, come from `fallback`.
 */
export class StratzGuideSource implements GuideSource {
  constructor(
    private readonly stratz: StratzHeroMatchups,
    private readonly fallback: GuideSource,
  ) {}

  itemPopularity = (heroId: number) => this.fallback.itemPopularity(heroId);
  benchmarks = (heroId: number) => this.fallback.benchmarks(heroId);
  proGames = (heroId: number) => this.fallback.proGames(heroId);
  proNames = (accountIds: readonly number[]) => this.fallback.proNames(accountIds);

  async matchups(heroId: number): Promise<{ rows: MatchupRow[]; source: MatchupSource } | null> {
    const hero = await this.stratz.forHero(heroId).catch(() => null);
    if (!hero) return this.fallback.matchups(heroId);
    const rows = [...hero.vs].map(([id, r]) => ({ heroId: id, games: r.games, wins: r.wins }));
    return { rows, source: "pubs" };
  }
}
