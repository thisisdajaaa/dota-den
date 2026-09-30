import { positionBreakdown, type PositionBreakdown } from "@/modules/meta";
import { err, ok, type Result } from "@/modules/shared/domain/result";
import {
  averageOf,
  heroIndex,
  heroRecord,
  highRankComparison,
  isNotableItem,
  itemPurchases,
  matchups,
  winRateTrend,
  type HeroGame,
  type HeroIndexRow,
  type HeroRecord,
  type HighRankComparison,
  type ItemSummary,
  type Matchups,
  type WinRateTrend,
} from "../domain/hero-stats";
import type {
  HeroCatalogEntry,
  HighRankStats,
  ItemCatalog,
  LaneHistory,
  OwnHeroGames,
  PlayerHeroSource,
  SourceError,
} from "./ports";

/** Games on the hero fetched from OpenDota for GPM, XPM and items (one upstream call). */
export const RECENT_HERO_GAMES = 100;

export interface HeroOverview {
  heroId: number;
  record: HeroRecord;
  trend: WinRateTrend;
}

export interface MatchupsView {
  /** Your games on the hero according to OpenDota (the matchups' sample). */
  games: number;
  matchups: Matchups;
}

export interface HeroDetailsView {
  /** Games looked at (your most recent on the hero, up to RECENT_HERO_GAMES). */
  sample: number;
  gpm: { average: number; games: number } | null;
  xpm: { average: number; games: number } | null;
  /** null when the item catalog is unavailable (we can't tell components from items). */
  items: ItemSummary | null;
}

export interface LaneBreakdownView {
  breakdown: PositionBreakdown;
  windowDays: number;
}

export class HeroesService {
  constructor(
    private readonly deps: {
      own: OwnHeroGames;
      player: PlayerHeroSource;
      highRank: HighRankStats;
      lanes: LaneHistory;
      heroes: readonly HeroCatalogEntry[];
      items: () => Promise<ItemCatalog>;
      timeZone: string;
    },
  ) {}

  /** Every hero you've played (from your imported games). */
  async index(accountId32: number): Promise<HeroIndexRow[]> {
    return heroIndex(await this.deps.own.games(accountId32));
  }

  /** Your record and win-rate trend on one hero (from your imported games). */
  async overview(accountId32: number, heroId: number): Promise<HeroOverview> {
    const games: HeroGame[] = (await this.deps.own.games(accountId32)).filter(
      (g) => g.heroId === heroId,
    );
    return {
      heroId,
      record: heroRecord(games),
      trend: winRateTrend(games, { timeZone: this.deps.timeZone }),
    };
  }

  async matchups(accountId32: number, heroId: number): Promise<Result<MatchupsView, SourceError>> {
    const res = await this.deps.player.matchups(accountId32, heroId);
    if (!res.ok) return res;
    return ok({ games: res.value.games, matchups: matchups(res.value.rows, heroId) });
  }

  async details(
    accountId32: number,
    heroId: number,
  ): Promise<Result<HeroDetailsView, SourceError>> {
    const [res, catalog] = await Promise.all([
      this.deps.player.recentGames(accountId32, heroId, RECENT_HERO_GAMES),
      this.deps.items(),
    ]);
    if (!res.ok) return res;
    const games = res.value;
    const notable = (key: string) => {
      const item = catalog.get(key);
      return item !== undefined && isNotableItem(item);
    };
    return ok({
      sample: games.length,
      gpm: averageOf(games.map((g) => g.goldPerMin)),
      xpm: averageOf(games.map((g) => g.xpPerMin)),
      items: catalog.size === 0 ? null : itemPurchases(games, notable),
    });
  }

  /** Your record next to public high-rank games on the hero. */
  async highRank(
    heroId: number,
    record: HeroRecord,
  ): Promise<Result<HighRankComparison, SourceError>> {
    const res = await this.deps.highRank.heroStats();
    if (!res.ok) return res;
    const comparison = highRankComparison(
      record,
      res.value.find((h) => h.heroId === heroId) ?? null,
    );
    return comparison ? ok(comparison) : err({ type: "not_found" });
  }

  /** Where you play (positions 1–5) and your win rate in each, from recent lane data. */
  async laneBreakdown(accountId32: number): Promise<Result<LaneBreakdownView, SourceError>> {
    if (this.deps.heroes.length === 0) return err({ type: "unavailable", cause: "hero catalog" });
    const res = await this.deps.lanes.recentLanes(accountId32);
    if (!res.ok) return res;
    const roles = new Map(this.deps.heroes.map((h) => [h.id, h.roles]));
    return ok({
      breakdown: positionBreakdown(res.value.games, (id) => roles.get(id)),
      windowDays: res.value.windowDays,
    });
  }
}
