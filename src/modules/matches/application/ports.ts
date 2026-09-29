import type { Result } from "@/modules/shared/domain/result";
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
}

export interface MatchProvider {
  fetchPlayerMatches(
    accountId32: number,
    page: { offset: number; limit: number },
  ): Promise<Result<ImportedPage, ProviderError>>;
  fetchPlayerProfile(accountId32: number): Promise<Result<PlayerProfileSnapshot, ProviderError>>;
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
}

export type LockOutcome =
  { type: "acquired"; state: SyncState } | { type: "locked" } | { type: "cooldown"; retryAt: Date };

export interface SyncStateRepository {
  /** Atomically take the per-account lock if not held and not cooling down. */
  acquire(
    accountId32: number,
    opts: { now: Date; lockTtlMs: number; cooldownMs: number },
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
export interface MatchQueries {
  importStatus(accountId32: number): Promise<ImportStatus>;
}
