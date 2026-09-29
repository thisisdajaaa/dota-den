import { err, ok, type Result } from "@/modules/shared/domain/result";
import { assignPatch, type PatchTimelineEntry } from "../domain/patch-assignment";
import type { PlayerMatchFact } from "../domain/player-match-fact";
import { classifyQueue, isRanked } from "../domain/queue-classification";
import type {
  ImportedPlayerMatch,
  MatchProvider,
  PatchTimelineSource,
  PlayerMatchFactRepository,
  ProviderError,
  SyncState,
  SyncStateRepository,
} from "./ports";

export const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
/** Shorter wait between syncs while older history is still being imported. */
export const BACKFILL_COOLDOWN_MS = 30 * 1000;
export const SYNC_LOCK_TTL_MS = 2 * 60 * 1000;
export const PAGE_SIZE = 100;
export const MAX_PAGES_PER_SYNC = 5;

export type SyncError =
  | { type: "sync_in_progress" }
  | { type: "cooldown"; retryAt: Date }
  | { type: "provider"; error: ProviderError };

export interface SyncSummary {
  fetched: number;
  inserted: number;
  updated: number;
  rejected: number;
  backfillComplete: boolean;
}

export function toFact(
  m: ImportedPlayerMatch,
  timeline: readonly PatchTimelineEntry[],
): PlayerMatchFact {
  const { partySize, ...rest } = m;
  return {
    ...rest,
    ranked: isRanked(m.lobbyType),
    queue: classifyQueue({ lobbyType: m.lobbyType, partySize }),
    patch: assignPatch(m.startedAt, timeline),
  };
}

export class MatchSyncService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      provider: MatchProvider;
      patches: PatchTimelineSource;
      facts: PlayerMatchFactRepository;
      syncState: SyncStateRepository;
      now?: () => Date;
      pageSize?: number;
      maxPages?: number;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Whether a sync is due: never synced, or past the applicable cooldown. */
  static isStale(state: SyncState | null, now: Date): boolean {
    if (!state?.lastSyncAt) return true;
    const cooldown = state.backfillComplete ? SYNC_COOLDOWN_MS : BACKFILL_COOLDOWN_MS;
    return now.getTime() - state.lastSyncAt.getTime() >= cooldown;
  }

  /**
   * Import new matches first (head), then spend any remaining page budget on backfill.
   * Idempotent: facts are upserted by (accountId32, matchId).
   */
  async sync(accountId32: number): Promise<Result<SyncSummary, SyncError>> {
    const pageSize = this.deps.pageSize ?? PAGE_SIZE;
    let budget = this.deps.maxPages ?? MAX_PAGES_PER_SYNC;

    const lock = await this.deps.syncState.acquire(accountId32, {
      now: this.now(),
      lockTtlMs: SYNC_LOCK_TTL_MS,
      cooldownMs: SYNC_COOLDOWN_MS,
      backfillCooldownMs: BACKFILL_COOLDOWN_MS,
    });
    if (lock.type === "locked") return err({ type: "sync_in_progress" });
    if (lock.type === "cooldown") return err({ type: "cooldown", retryAt: lock.retryAt });

    const state = lock.state;
    const summary: SyncSummary = {
      fetched: 0,
      inserted: 0,
      updated: 0,
      rejected: 0,
      backfillComplete: state.backfillComplete,
    };

    try {
      const timeline = await this.deps.patches.getTimeline();
      // A missing patch timeline degrades patch labels to unknown; it doesn't block import.
      const entries = timeline.ok ? timeline.value : [];

      let newestStartedAt = state.newestStartedAt;
      let backfillOffset = state.backfillOffset;
      let offset = 0;
      let newCount = 0;

      // Head: walk from the newest match until we reach one we already have.
      while (budget > 0) {
        const page = await this.fetchPage(accountId32, offset, pageSize, entries, summary);
        budget--;
        if (!page.ok) return this.fail(accountId32, page.error);
        const { facts, rawCount } = page.value;
        for (const f of facts) {
          if (!newestStartedAt || f.startedAt > newestStartedAt) newestStartedAt = f.startedAt;
        }
        const unseen = state.newestStartedAt
          ? facts.filter((f) => f.startedAt > state.newestStartedAt!).length
          : facts.length;
        newCount += unseen;
        offset += pageSize;
        const reachedKnown = state.newestStartedAt !== null && unseen < facts.length;
        if (rawCount < pageSize) {
          if (state.newestStartedAt === null) summary.backfillComplete = true;
          break;
        }
        if (reachedKnown) break;
      }

      // First sync: head pages are the backfill so far.
      if (state.newestStartedAt === null) backfillOffset = offset;
      else backfillOffset += newCount;

      // Backfill: continue into older history.
      while (budget > 0 && !summary.backfillComplete) {
        const page = await this.fetchPage(accountId32, backfillOffset, pageSize, entries, summary);
        budget--;
        if (!page.ok) return this.fail(accountId32, page.error);
        backfillOffset += pageSize;
        if (page.value.rawCount < pageSize) summary.backfillComplete = true;
      }

      await this.deps.syncState.release(accountId32, {
        lastSyncAt: this.now(),
        newestStartedAt,
        backfillOffset,
        backfillComplete: summary.backfillComplete,
      });
      return ok(summary);
    } catch (e) {
      await this.deps.syncState.abandon(accountId32);
      throw e;
    }
  }

  private async fetchPage(
    accountId32: number,
    offset: number,
    limit: number,
    timeline: readonly PatchTimelineEntry[],
    summary: SyncSummary,
  ): Promise<Result<{ facts: PlayerMatchFact[]; rawCount: number }, ProviderError>> {
    const page = await this.deps.provider.fetchPlayerMatches(accountId32, { offset, limit });
    if (!page.ok) return page;
    const facts = page.value.matches.map((m) => toFact(m, timeline));
    const written = await this.deps.facts.upsertMany(facts);
    summary.fetched += facts.length;
    summary.rejected += page.value.rejectedCount;
    summary.inserted += written.inserted;
    summary.updated += written.updated;
    // Rejected rows still occupy upstream offsets, so pagination uses the raw count.
    return ok({ facts, rawCount: facts.length + page.value.rejectedCount });
  }

  private async fail(accountId32: number, error: ProviderError): Promise<Result<never, SyncError>> {
    await this.deps.syncState.abandon(accountId32);
    return err({ type: "provider", error });
  }
}
