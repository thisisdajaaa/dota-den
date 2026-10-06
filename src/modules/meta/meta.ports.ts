import type { Patch } from "@/modules/patches/domain/patch";
import type { LatestPatch } from "./domain/patch-tips";
import type { Result } from "@/common/result";
import type { DuoRow } from "./domain/lane-duos";
import type { HeroPublicStats, LaneStats, ProDrafts } from "./domain/meta-stats";
import type { LaneGame } from "./domain/position";

export type SourceError =
  | { type: "rate_limited"; retryAfterMs: number | null }
  | { type: "unavailable"; cause: string }
  | { type: "not_found" }
  | { type: "invalid_payload"; cause: string };

/** A value with the time it was fetched from upstream (for "updated … ago"). */
export interface Fetched<T> {
  value: T;
  fetchedAt: Date;
}

export type SourceResult<T> = Promise<Result<Fetched<T>, SourceError>>;

/** Public and pro meta data (OpenDota). */
export interface MetaStatsSource {
  /** Every hero's high-rank record (brackets 6–8) and 7-day public pick trend. */
  heroStats(): SourceResult<HeroPublicStats[]>;
  /** One hero's win counts per lane role in recent public parsed games. */
  laneRoles(heroId: number): SourceResult<LaneStats>;
  /** Pro picks and bans per hero over the last 21 days. */
  proDrafts(): SourceResult<ProDrafts>;
  /** Pro same-team same-lane pairs over the last 60 days. */
  proLaneDuos(): SourceResult<{ windowDays: number; rows: DuoRow[] }>;
}

/** A player's recent games with lane info, for reading their usual position. */
export interface PlayerLaneHistory {
  recentLanes(accountId32: number): SourceResult<{ windowDays: number; games: LaneGame[] }>;
}

/** Hero id and catalog roles ("Carry", "Support", …). */
export interface MetaHero {
  id: number;
  roles: readonly string[];
}

/** The newest imported patch with its notes (from the patches feature); null when none. */
export interface LatestPatchSource {
  latest(): Promise<Pick<Patch, "sections" | "version" | "publishedAt"> | null>;
}

export type LatestPatchResult =
  { status: "ok"; patch: LatestPatch } | { status: "none" } | { status: "unavailable" };
