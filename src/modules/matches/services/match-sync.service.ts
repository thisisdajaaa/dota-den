import { err, ok, type Result } from "@/common/result";
import { assignPatch, type PatchTimelineEntry } from "../domain/patch-assignment";
import type { PlayerMatchFact } from "../domain/player-match-fact";
import { classifyQueue, isRanked } from "../domain/queue-classification";
import type {
  ImportedPlayerMatch,
  MatchProvider,
  PatchTimelineSource,
  MatchFactsPort,
  ProviderError,
  SyncState,
  SyncStatesPort,
} from "../matches.ports";
import type { SyncError, SyncSummary } from "../dtos/responses/matches.dto";

import { BACKFILL_COOLDOWN_MS, SYNC_COOLDOWN_MS } from "../domain/sync-policy";

export { BACKFILL_COOLDOWN_MS, SYNC_COOLDOWN_MS };
export const SYNC_LOCK_TTL_MS = 2 * 60 * 1000;
export const PAGE_SIZE = 100;
/** While nothing is imported: how often we may ask the upstream to refetch the history. */
export const HISTORY_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
/**
 * Once matches exist: re-request periodically anyway. The upstream's copy of a history is
 * often incomplete (it only has matches it happened to collect) until it's asked.
 */
export const PERIODIC_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** Time for the upstream to finish a refresh before we re-walk the whole history. */
export const RESCAN_DELAY_MS = 15 * 60 * 1000;
export const MAX_PAGES_PER_SYNC = 5;

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
      facts: MatchFactsPort;
      syncState: SyncStatesPort;
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
  async sync(
    accountId32: number,
    opts: {
      maxPages?: number;
      /** Stop importing older history at this time (ms epoch); new matches still come first. */
      deadline?: number;
    } = {},
  ): Promise<Result<SyncSummary, SyncError>> {
    const pageSize = this.deps.pageSize ?? PAGE_SIZE;
    let budget = opts.maxPages ?? this.deps.maxPages ?? MAX_PAGES_PER_SYNC;

    const lock = await this.deps.syncState.acquire(accountId32, {
      now: this.now(),
      lockTtlMs: SYNC_LOCK_TTL_MS,
      cooldownMs: SYNC_COOLDOWN_MS,
      backfillCooldownMs: BACKFILL_COOLDOWN_MS,
    });
    if (lock.type === "locked") return err({ type: "sync_in_progress" });
    if (lock.type === "cooldown") return err({ type: "cooldown", retryAt: lock.retryAt });

    const state = lock.state;
    // Nothing imported yet: treat as a fresh history, so a later non-empty result gets a
    // full backfill instead of stopping after the head pages.
    const fresh = state.newestStartedAt === null;
    // After a refresh request has had time to finish, re-walk the whole history once:
    // incremental syncs only look for newer matches, so older ones the upstream just found
    // would otherwise never be imported. Upserts make the re-walk safe.
    const requestedAt = state.historyRefreshRequestedAt;
    const rescan =
      !fresh &&
      requestedAt !== null &&
      this.now().getTime() - requestedAt.getTime() >= RESCAN_DELAY_MS &&
      (state.rescannedAt === null || state.rescannedAt < requestedAt);
    const summary: SyncSummary = {
      fetched: 0,
      inserted: 0,
      updated: 0,
      rejected: 0,
      backfillComplete: fresh || rescan ? false : state.backfillComplete,
      historyRefreshRequested: false,
    };

    try {
      const timeline = await this.deps.patches.getTimeline();
      // A missing patch timeline degrades patch labels to unknown; it doesn't block import.
      const entries = timeline.ok ? timeline.value : [];

      let newestStartedAt = state.newestStartedAt;
      let backfillOffset = fresh || rescan ? 0 : state.backfillOffset;
      let offset = 0;
      let newCount = 0;

      // Head: walk from the newest match until we reach one we already have.
      while (budget > 0) {
        // A first import is all history: it can stop at the deadline after a page and carry
        // on next time. (A known history can't: stopping could leave a gap of new games.)
        if (
          fresh &&
          offset > 0 &&
          opts.deadline !== undefined &&
          this.now().getTime() >= opts.deadline
        )
          break;
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
        if (opts.deadline !== undefined && this.now().getTime() >= opts.deadline) break;
        const page = await this.fetchPage(accountId32, backfillOffset, pageSize, entries, summary);
        budget--;
        // Older history can wait: keep what this sync already imported and try again later.
        if (!page.ok) break;
        backfillOffset += pageSize;
        if (page.value.rawCount < pageSize) summary.backfillComplete = true;
      }

      // Ask the upstream to fetch the full history from Steam: on first sync, every 6h while
      // still empty, and weekly otherwise. Best effort; the import itself already succeeded.
      let historyRefreshRequestedAt = state.historyRefreshRequestedAt;
      const interval =
        newestStartedAt === null ? HISTORY_REFRESH_INTERVAL_MS : PERIODIC_REFRESH_INTERVAL_MS;
      const refreshDue =
        !historyRefreshRequestedAt ||
        this.now().getTime() - historyRefreshRequestedAt.getTime() >= interval;
      if (refreshDue) {
        const requested = await this.deps.provider.requestHistoryRefresh(accountId32);
        if (requested.ok) {
          historyRefreshRequestedAt = this.now();
          summary.historyRefreshRequested = true;
        }
      }

      await this.deps.syncState.release(accountId32, {
        lastSyncAt: this.now(),
        newestStartedAt,
        backfillOffset,
        backfillComplete: summary.backfillComplete,
        historyRefreshRequestedAt,
        rescannedAt: rescan ? this.now() : state.rescannedAt,
      });
      return ok(summary);
    } catch (e) {
      await this.deps.syncState.abandon(accountId32);
      throw e;
    }
  }

  /**
   * Background sync for everyone (daily cron): keeps histories importing and matches fresh
   * without the player visiting. Accounts go one at a time, most in need first, until the
   * time budget runs out; each gets a larger page budget than an on-visit sync.
   */
  async syncDue(opts: {
    limit: number;
    budgetMs: number;
    maxPages: number;
    /** Older history per account per run, so one long import can't starve everyone else. */
    perAccountMs?: number;
  }): Promise<Array<{ accountId32: number; outcome: string; inserted?: number }>> {
    const started = this.now().getTime();
    const perAccount = opts.perAccountMs ?? 8_000;
    const out: Array<{ accountId32: number; outcome: string; inserted?: number }> = [];
    for (const accountId32 of await this.deps.syncState.dueForSync(opts.limit)) {
      if (this.now().getTime() - started >= opts.budgetMs) {
        out.push({ accountId32, outcome: "skipped_time" });
        continue;
      }
      try {
        const res = await this.sync(accountId32, {
          maxPages: opts.maxPages,
          deadline: Math.min(started + opts.budgetMs, this.now().getTime() + perAccount),
        });
        out.push(
          res.ok
            ? {
                accountId32,
                outcome: res.value.backfillComplete ? "synced" : "backfilling",
                inserted: res.value.inserted,
              }
            : { accountId32, outcome: res.error.type },
        );
      } catch {
        out.push({ accountId32, outcome: "error" });
      }
    }
    return out;
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
