import type { StratzHeroMatchups } from "@/common/providers/stratz-hero-matchups";
import type { DraftInsights } from "../drafts.ports";
import type { HeroMeta, MatchupTable } from "../domain/draft-scoring";
import type { OpenDotaDraftInsights } from "./opendota-draft-insights";

/** Fewer heroes than this and STRATZ's answer is treated as incomplete. */
export const MIN_STRATZ_HEROES = 100;

/**
 * Hero win rates and head-to-head matchups from STRATZ (the latest full week of Legend–Immortal
 * pubs, about 180,000 games for a popular hero) instead of OpenDota's, whose matchups only
 * cover pro games.
 * Tournament data (picks, bans, pairs, positions, lanes) stays on OpenDota, and anything STRATZ
 * can't answer falls back to it.
 */
export class StratzDraftInsights implements DraftInsights {
  constructor(
    private readonly stratz: StratzHeroMatchups,
    private readonly fallback: OpenDotaDraftInsights,
  ) {}

  async heroMeta(): Promise<ReadonlyMap<number, HeroMeta>> {
    const all = await this.stratz.all();
    if (!all || all.size < MIN_STRATZ_HEROES) return this.fallback.heroMeta();
    return new Map([...all].map(([id, h]) => [id, { games: h.games, wins: h.wins }]));
  }

  async matchups(heroId: number): Promise<MatchupTable | null> {
    const hero = await this.stratz.forHero(heroId);
    return hero ? hero.vs : this.fallback.matchups(heroId);
  }

  proMeta = () => this.fallback.proMeta();
  synergy = () => this.fallback.synergy();
  positions = () => this.fallback.positions();
  lanes = () => this.fallback.lanes();

  /** Refresh the tournament queries and every STRATZ chunk (the daily cron). */
  async warm(): Promise<{ key: string; ok: boolean }[]> {
    const [pro, stratz] = await Promise.all([this.fallback.warm(), this.stratz.all()]);
    return [...pro, { key: "stratz-matchups", ok: stratz !== null }];
  }
}
