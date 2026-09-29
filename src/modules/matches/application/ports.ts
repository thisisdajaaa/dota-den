import type { Result } from "@/modules/shared/domain/result";
import type { MatchDetail } from "../domain/match-detail";
import type { MatchListFilter } from "./match-list-filter";
import type { PatchTimelineEntry } from "../domain/patch-assignment";
import type { PlayerMatchFact, Provenance } from "../domain/player-match-fact";

export type ProviderError =
  | { type: "rate_limited"; retryAfterMs: number | null }
  | { type: "unavailable"; cause: string }
  | { type: "not_found" }
  | { type: "invalid_payload"; cause: string };

/** Provider-neutral match row after the anti-corruption layer; policies not yet applied. */
export interface ImportedPlayerMatch extends Omit<
  PlayerMatchFact,
  "queue" | "patch" | "ranked" | "provenance"
> {
  partySize: number | null;
  provenance: Provenance;
}

export interface ImportedPage {
  matches: ImportedPlayerMatch[];
  /** Rows dropped because they failed validation. */
  rejectedCount: number;
}

export interface PlayerProfileSnapshot {
  accountId32: number;
  personaName: string | null;
  avatarUrl: string | null;
  /**
   * `limited` when the upstream reports full history unavailable (often a Steam privacy
   * setting); matches it learned from other players may still appear.
   */
  matchHistory: "full" | "limited" | "unknown";
  rankTier: number | null;
  /** Valve's Immortal leaderboard position for the player's region, when listed. */
  leaderboardRank: number | null;
}

export interface MatchProvider {
  fetchPlayerMatches(
    accountId32: number,
    page: { offset: number; limit: number },
  ): Promise<Result<ImportedPage, ProviderError>>;
  fetchPlayerProfile(accountId32: number): Promise<Result<PlayerProfileSnapshot, ProviderError>>;
  /**
   * Ask the upstream to (re)fetch this player's full match history from Steam. Needed after
   * a player turns on "Expose Public Match Data": the upstream doesn't notice on its own.
   */
  requestHistoryRefresh(accountId32: number): Promise<Result<true, ProviderError>>;
}

export interface PatchTimelineSource {
  getTimeline(): Promise<Result<PatchTimelineEntry[], ProviderError>>;
}

export interface PlayerMatchFactRepository {
  upsertMany(facts: readonly PlayerMatchFact[]): Promise<{ inserted: number; updated: number }>;
}

export interface SyncState {
  accountId32: number;
  lastSyncAt: Date | null;
  newestStartedAt: Date | null;
  backfillOffset: number;
  backfillComplete: boolean;
  /** Last time we asked the upstream to refetch this player's history. */
  historyRefreshRequestedAt: Date | null;
  /** When the last full re-walk after a refresh request started. */
  rescannedAt: Date | null;
}

export type LockOutcome =
  { type: "acquired"; state: SyncState } | { type: "locked" } | { type: "cooldown"; retryAt: Date };

export interface SyncStateRepository {
  /**
   * Atomically take the per-account lock if not held and not cooling down.
   * `backfillCooldownMs` applies instead of `cooldownMs` while history is still importing.
   */
  acquire(
    accountId32: number,
    opts: { now: Date; lockTtlMs: number; cooldownMs: number; backfillCooldownMs: number },
  ): Promise<LockOutcome>;
  release(accountId32: number, next: Omit<SyncState, "accountId32">): Promise<void>;
  /** Release without recording a completed sync (so the user can retry). */
  abandon(accountId32: number): Promise<void>;
  get(accountId32: number): Promise<SyncState | null>;
}

export interface ImportStatus {
  sync: SyncState | null;
  totals: { all: number; solo: number; party: number; unknown: number };
}

/** Read models for Match Intelligence (query side). */
export interface RankedResultRow {
  matchId: string;
  startedAt: Date;
  heroId: number;
  result: "win" | "loss";
  queueClass: "solo" | "party" | "unknown";
}

export interface MatchListPage {
  items: DashboardFact[];
  nextCursor: string | null;
  /** Matches in the filtered list (every filter applied), across all pages. */
  matching: number;
  /**
   * Record under every filter except `result`: a "wins only" view still reports the real
   * wins and losses for the same heroes/queues/time, instead of a meaningless 100%.
   */
  record: { games: number; wins: number };
  latestPatch: string | null;
}

export interface MatchQueries {
  importStatus(accountId32: number): Promise<ImportStatus>;
  listMatches(
    accountId32: number,
    filter: MatchListFilter,
    now: Date,
    limit: number,
  ): Promise<MatchListPage>;
  /** Ranked results in a time range (for the MMR calendar). */
  rankedResults(accountId32: number, range: { from: Date; to: Date }): Promise<RankedResultRow[]>;
  /** Heroes this account has imported matches on, most played first. */
  playedHeroes(accountId32: number): Promise<Array<{ heroId: number; games: number }>>;
  dashboardFacts(accountId32: number, filter: DashboardFilter, now: Date): Promise<DashboardFacts>;
}

export interface HeroInfo {
  id: number;
  name: string;
  /** null when upstream gives an unexpected image path (never render untrusted hosts). */
  imageUrl: string | null;
  iconUrl: string | null;
  /** Large transparent hero render for banners. */
  renderUrl: string | null;
  roles: string[];
  attackType: "Melee" | "Ranged" | null;
  primaryAttr: "str" | "agi" | "int" | "all" | null;
}

export interface HeroCatalog {
  getHeroes(): Promise<Result<HeroInfo[], ProviderError>>;
}

export type DashboardRange = "all" | "patch" | "30d";
export type DashboardMode = "all" | "ranked";

export interface DashboardFilter {
  range: DashboardRange;
  mode: DashboardMode;
}

/** Row shape for dashboard read models. */
export interface DashboardFact {
  matchId: string;
  startedAt: Date;
  durationSec: number;
  heroId: number;
  side: "radiant" | "dire";
  result: "win" | "loss";
  kills: number;
  deaths: number;
  assists: number;
  ranked: boolean;
  queueClass: "solo" | "party" | "unknown";
  partySize: number | null;
  patch: string | null;
  patchCertainty: "confident" | "boundary" | "unknown";
}

export interface DashboardFacts {
  facts: DashboardFact[];
  /** Patch of the most recent imported match; the "current patch" filter uses it. */
  latestPatch: string | null;
}

export interface ItemInfo {
  id: number;
  name: string;
  imageUrl: string | null;
}

export interface MatchDetailProvider {
  fetchMatch(matchId: string): Promise<Result<MatchDetail, ProviderError>>;
  getItems(): Promise<Result<ItemInfo[], ProviderError>>;
}
