import { positionBreakdown } from "@/modules/meta/domain/position";
import { err, ok, type Result } from "@/common/result";
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
} from "./domain/hero-stats";
import { heroCoaching, itemImpact, type HeroCoaching } from "./domain/hero-coaching";
import { heroProgress } from "./domain/hero-progress";
import { lineupProgress, ownMatchups } from "./domain/own-matchups";
import type { MatchupsFilter } from "./schemas/matchups-filter.schema";
import type {
  HeroCatalogEntry,
  HighRankStats,
  ItemCatalog,
  LaneHistory,
  OwnHeroGames,
  OwnLineups,
  PlayerHeroSource,
  SourceError,
  StoredExtras,
} from "./heroes.ports";
import type {
  HeroDetailsView,
  HeroOverview,
  LaneBreakdownView,
  MatchupsView,
  OwnMatchupsView,
} from "./dtos/responses/heroes.dto";

/** Games on the hero fetched from OpenDota for GPM, XPM and items (one upstream call). */
export const RECENT_HERO_GAMES = 100;

export class HeroesService {
  constructor(
    private readonly deps: {
      own: OwnHeroGames;
      lineups: OwnLineups;
      player: PlayerHeroSource;
      highRank: HighRankStats;
      lanes: LaneHistory;
      extras: StoredExtras;
      /** The hero catalog (ids and roles). */
      heroes: () => Promise<readonly HeroCatalogEntry[]>;
      items: () => Promise<ItemCatalog>;
    },
  ) {}

  /** Every hero you've played (from your imported games). */
  async index(accountId32: number): Promise<HeroIndexRow[]> {
    return heroIndex(await this.deps.own.games(accountId32));
  }

  /** Your record and win-rate trend on one hero (from your imported games). */
  /** `timeZone` is the viewer's, for the win rate trend's day boundaries. */
  async overview(accountId32: number, heroId: number, timeZone: string): Promise<HeroOverview> {
    const games: HeroGame[] = (await this.deps.own.games(accountId32, heroId)).filter(
      (g) => g.heroId === heroId,
    );
    return {
      heroId,
      record: heroRecord(games),
      trend: winRateTrend(games, { timeZone }),
    };
  }

  /** Who you lose to (and beat, and win with), from the lineups of your own imported games. */
  async ownMatchups(
    accountId32: number,
    filter: MatchupsFilter,
    now: Date,
  ): Promise<OwnMatchupsView> {
    const [{ games, latestPatch }, coverage] = await Promise.all([
      this.deps.lineups.games(accountId32, filter, now),
      this.deps.lineups.coverage(accountId32),
    ]);
    return {
      filter,
      matchups: ownMatchups(games),
      progress: lineupProgress(coverage),
      latestPatch,
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
      impact: catalog.size === 0 ? null : itemImpact(games, notable),
      progress: heroProgress(
        games.flatMap((g) =>
          g.startedAt
            ? [
                {
                  startedAt: g.startedAt,
                  durationSec: g.durationSec ?? 0,
                  won: g.won ?? null,
                  goldPerMin: g.goldPerMin,
                  xpPerMin: g.xpPerMin,
                  lastHits: g.lastHits ?? null,
                  kills: g.kills ?? 0,
                  deaths: g.deaths ?? 0,
                  assists: g.assists ?? 0,
                },
              ]
            : [],
        ),
      ),
    });
  }

  /**
   * Item timings in wins vs losses and lane results by role, from the stored extras of your
   * parsed games on the hero. null when the item catalog is unavailable.
   */
  async coaching(accountId32: number, heroId: number): Promise<HeroCoaching | null> {
    const [{ games, parsedGames }, catalog] = await Promise.all([
      this.deps.extras.forHero(accountId32, heroId),
      this.deps.items(),
    ]);
    if (catalog.size === 0) return null;
    return heroCoaching(games, parsedGames, (key) => {
      const item = catalog.get(key);
      return item !== undefined && isNotableItem(item);
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
    const heroes = await this.deps.heroes();
    if (heroes.length === 0) return err({ type: "unavailable", cause: "hero catalog" });
    const res = await this.deps.lanes.recentLanes(accountId32);
    if (!res.ok) return res;
    const roles = new Map(heroes.map((h) => [h.id, h.roles]));
    return ok({
      breakdown: positionBreakdown(res.value.games, (id) => roles.get(id)),
      windowDays: res.value.windowDays,
    });
  }
}
