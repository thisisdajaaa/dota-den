import type { LaneGame } from "@/modules/meta";
import type { Result } from "@/common/result";
import type { HeroGame, ItemMeta, MatchupRow } from "../domain/hero-stats";

export type SourceError =
  | { type: "rate_limited"; retryAfterMs: number | null }
  | { type: "unavailable"; cause: string }
  | { type: "not_found" }
  | { type: "invalid_payload"; cause: string };

export type SourceResult<T> = Promise<Result<T, SourceError>>;

/** Your imported games (our database), for records and trends. */
export interface OwnHeroGames {
  games(accountId32: number): Promise<HeroGame[]>;
}

/** Per-game extras OpenDota keeps for your games on a hero (not stored by us). */
export interface HeroGameExtras {
  matchId: string;
  goldPerMin: number | null;
  xpPerMin: number | null;
  /** Item key → times bought; null when the replay wasn't parsed. */
  purchase: Record<string, number> | null;
  startedAt?: Date | null;
  durationSec?: number | null;
  won?: boolean | null;
  lastHits?: number | null;
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
}

/** OpenDota's per-player hero data. */
export interface PlayerHeroSource {
  /**
   * With/against counts for every other hero, over the games where you played `heroId`,
   * plus your total games on it (OpenDota's count).
   */
  matchups(
    accountId32: number,
    heroId: number,
  ): SourceResult<{ games: number; rows: MatchupRow[] }>;
  /** Your most recent games on `heroId` (newest first), with GPM, XPM and purchases. */
  recentGames(accountId32: number, heroId: number, limit: number): SourceResult<HeroGameExtras[]>;
}

/** Public high-rank (brackets 6–8 combined) records per hero. */
export interface HighRankStats {
  heroStats(): SourceResult<Array<{ heroId: number; games: number; wins: number }>>;
}

/** Your recent games with lane info (the Meta page's source). */
export interface LaneHistory {
  recentLanes(accountId32: number): SourceResult<{ windowDays: number; games: LaneGame[] }>;
}

export interface HeroCatalogEntry {
  id: number;
  roles: readonly string[];
}

export type ItemCatalog = ReadonlyMap<string, ItemMeta>;
