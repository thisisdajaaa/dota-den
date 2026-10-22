import type { Result } from "@/common/result";
import type {
  ProviderError,
  PlayerProfileSnapshot,
  RankedResultRow,
  HeroInfo,
  DashboardFilter,
  DashboardFact,
  DashboardFacts,
  DashboardView,
  ItemInfo,
  LineupCoverage,
  LineupFacts,
  LineupFilter,
} from "./domain/read-models";

export type {
  ProviderError,
  PlayerProfileSnapshot,
  RankedResultRow,
  HeroInfo,
  DashboardRange,
  DashboardMode,
  DashboardFilter,
  DashboardFact,
  DashboardFacts,
  DashboardSummaryFact,
  DashboardView,
  ItemInfo,
  LineupCoverage,
  LineupFact,
  LineupFacts,
  LineupFilter,
} from "./domain/read-models";
import type { MatchDetail } from "./domain/match-detail";
import type { MatchExtras } from "./domain/match-extras";
import type { MatchListFilter } from "./schemas/match-list-filter.schema";
import type { PatchTimelineEntry } from "./domain/patch-assignment";
import type { PlayerMatchFact, Provenance } from "./domain/player-match-fact";

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

/** Per-call limits for a slow upstream request (timeout, retries, circuit isolation). */
export interface ProviderCallOptions {
  timeoutMs?: number;
  maxRetries?: number;
  /** Failures don't count toward the provider's circuit breaker. */
  isolated?: boolean;
}

export interface MatchProvider {
  fetchPlayerMatches(
    accountId32: number,
    page: { offset: number; limit: number },
    call?: ProviderCallOptions,
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

export interface MatchFactsPort {
  upsertMany(facts: readonly PlayerMatchFact[]): Promise<{ inserted: number; updated: number }>;
  /** Imported games stored before lineups were kept (to be re-read for them). */
  countWithoutLineups(accountId32: number): Promise<number>;
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
  /** Lineup backfill: next upstream offset to re-read older games' lineups from. */
  lineupBackfillOffset: number;
  /** Every stored game has been re-read for its lineups (or the history ran out). */
  lineupBackfillComplete: boolean;
}

export type LockOutcome =
  { type: "acquired"; state: SyncState } | { type: "locked" } | { type: "cooldown"; retryAt: Date };

export interface SyncStatesPort {
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
  /** Accounts to sync in the background, least recently synced first. */
  dueForSync(limit: number): Promise<number[]>;
}

export interface ImportStatus {
  sync: SyncState | null;
  totals: { all: number; solo: number; party: number; unknown: number };
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
    /** Only these matches (e.g. the ones you tagged); undefined for all. */
    onlyMatchIds?: readonly string[],
  ): Promise<MatchListPage>;
  /** Ranked results in a time range (for the MMR calendar). */
  rankedResults(accountId32: number, range: { from: Date; to: Date }): Promise<RankedResultRow[]>;
  /** Every imported game (all types) that started in a time range, oldest first. */
  factsBetween(accountId32: number, range: { from: Date; to: Date }): Promise<DashboardFact[]>;
  /** Heroes this account has imported matches on, most played first. */
  playedHeroes(accountId32: number): Promise<Array<{ heroId: number; games: number }>>;
  dashboardFacts(accountId32: number, filter: DashboardFilter, now: Date): Promise<DashboardFacts>;
  /**
   * The dashboard's games: the same rows as dashboardFacts, but only the summary's fields,
   * plus the newest `recent` games in full.
   */
  dashboardView(
    accountId32: number,
    filter: DashboardFilter,
    now: Date,
    recent: number,
  ): Promise<DashboardView>;
  /** Your games with both lineups, for matchups from your own games. */
  lineupFacts(accountId32: number, filter: LineupFilter, now: Date): Promise<LineupFacts>;
  /** How far the lineup backfill has got. */
  lineupCoverage(accountId32: number): Promise<LineupCoverage>;
  /** Matches that started after `after`, oldest first, skipping `excludeMatchIds` (the Discord feed). */
  startedAfter(
    accountId32: number,
    after: Date,
    opts: { excludeMatchIds: readonly string[]; limit: number },
  ): Promise<Array<DashboardFact & { gameMode: number | null }>>;
}

export interface HeroCatalog {
  getHeroes(): Promise<Result<HeroInfo[], ProviderError>>;
}

export interface MatchDetailProvider {
  fetchMatch(matchId: string): Promise<Result<MatchDetail, ProviderError>>;
  /** Ask the upstream to parse the replay (laning, item timings, wards). */
  requestParse(matchId: string): Promise<Result<true, ProviderError>>;
  getItems(): Promise<Result<ItemInfo[], ProviderError>>;
}

/** Everything the matches feature reads from OpenDota (the adapter implements it). */
export interface OpenDotaMatchesSource
  extends MatchProvider, PatchTimelineSource, HeroCatalog, MatchDetailProvider {
  fetchPlayerMatches(
    accountId32: number,
    page: { offset: number; limit: number },
    opts?: { cacheTtlMs?: number; includedAccountId?: number } & ProviderCallOptions,
  ): Promise<Result<ImportedPage, ProviderError>>;
}

/** An imported parsed game whose extras aren't stored yet. */
export interface PendingExtras {
  matchId: string;
  heroId: number;
  side: "radiant" | "dire";
  result: "win" | "loss";
  startedAt: Date;
}

/** Stored per-match extras (match_extras) and the parsed games still waiting for them. */
export interface MatchExtrasStore {
  /** Your parsed imported games with no extras stored yet, newest first. */
  pendingParsed(accountId32: number, limit: number): Promise<PendingExtras[]>;
  /** Match details fetched for you since `since` (the daily cap). */
  fetchedSince(accountId32: number, since: Date): Promise<number>;
  save(extras: MatchExtras, fetchedAt: Date): Promise<void>;
  /** Your stored extras from parsed replays on one hero, newest first. */
  forHero(accountId32: number, heroId: number): Promise<MatchExtras[]>;
  /** Your imported games on the hero that OpenDota has parsed (stored or not). */
  parsedGamesOnHero(accountId32: number, heroId: number): Promise<number>;
  exportForOwner(owner: { accountId32: number }): Promise<Array<Record<string, unknown>>>;
  deleteForOwner(owner: { accountId32: number }): Promise<number>;
}
