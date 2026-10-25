import type { Logger } from "@/common/logging/logger";
import { bucketedKey, type JobName } from "../domain/job";
import type { JobHandler, JobQueue, MatchSyncPort } from "../jobs.ports";

/** A long history is imported in chunks; stop chaining after this many (a safety net). */
export const MAX_BACKFILL_CHUNKS = 300;
/** Someone else is syncing this account; check back after this. */
const BUSY_RETRY_MS = 60_000;

/** Background jobs: what each job does, and queueing them. */
export class JobsService {
  constructor(
    private readonly deps: {
      queue: () => JobQueue;
      matches: MatchSyncPort;
      /** Wait between history chunks (the sync cooldown) when `cooldownFor` isn't given. */
      backfillCooldownMs: number;
      /**
       * The account's wait between history chunks (shorter with Plus priority sync, ADR 0014).
       * Should fall back to the free cooldown rather than throw.
       */
      cooldownFor?: (accountId32: number) => Promise<number>;
      warmDraftData: () => Promise<Array<{ key: string; ok: boolean }>>;
      /** The Meta page's slow tournament queries. */
      warmMeta: () => Promise<Array<{ key: string; ok: boolean }>>;
      /** Plus go-live alerts (one run). Optional: without it the job does nothing. */
      streamerAlerts?: () => Promise<Record<string, unknown>>;
      /** One attempt at a Plus auto review (it re-queues itself while the replay is parsed). */
      coachAutoReview?: (payload: Record<string, unknown>) => Promise<void>;
      logger: Pick<Logger, "info">;
      now?: () => number;
    },
  ) {}

  /** Handlers by job name, for the job runner. */
  handlers(): Record<JobName, JobHandler> {
    return {
      "match-backfill": (payload) => this.backfillChunk(payload),
      "draft-meta-warm": () => this.warmDraftData(),
      "meta-warm": () => this.warmMeta(),
      "streamer-alerts": async () => {
        await this.runStreamerAlerts();
      },
      "coach-auto-review": async (payload) => {
        await this.deps.coachAutoReview?.(payload);
      },
    };
  }

  /**
   * Queue one attempt at a Plus auto review. Each attempt has its own dedup key, so a retry
   * runs once however many times it's queued. Without a durable queue nothing can wait: the
   * attempt runs right after the response instead.
   */
  async enqueueCoachAutoReview(
    payload: { userId: string; matchId: string; attempt: number },
    delaySec: number,
  ): Promise<void> {
    const queue = this.deps.queue();
    await queue.enqueue("coach-auto-review", payload, {
      dedupKey: `coach-review:${payload.userId}:${payload.matchId}:${payload.attempt}`,
      ...(queue.durable ? { delaySec } : {}),
    });
  }

  /**
   * Continue a match-history import in the background (durable queue only: without QStash the
   * import continues on the player's next sync).
   */
  async enqueueMatchBackfill(
    accountId32: number,
    opts: { chunk?: number; delayMs?: number } = {},
  ): Promise<void> {
    const queue = this.deps.queue();
    if (!queue.durable) return;
    const cooldown = await this.cooldown(accountId32);
    const delayMs = opts.delayMs ?? cooldown;
    await queue.enqueue(
      "match-backfill",
      { accountId32, chunk: opts.chunk ?? 0 },
      {
        // One chunk per account per cooldown, whoever asks. The next chunk of a chain is
        // always at least one cooldown later, so it lands in a later bucket than its parent.
        dedupKey: bucketedKey(`backfill:${accountId32}`, cooldown, this.now() + delayMs),
        delaySec: Math.ceil(delayMs / 1000),
      },
    );
  }

  private async cooldown(accountId32: number): Promise<number> {
    if (!this.deps.cooldownFor) return this.deps.backfillCooldownMs;
    try {
      return await this.deps.cooldownFor(accountId32);
    } catch {
      return this.deps.backfillCooldownMs;
    }
  }

  /** One chunk of a match-history import; queues the next chunk while history remains. */
  async backfillChunk(payload: Record<string, unknown>): Promise<void> {
    const accountId32 = Number(payload.accountId32);
    const chunk = Number(payload.chunk ?? 0);
    if (!Number.isInteger(accountId32) || accountId32 <= 0) return;
    const res = await this.deps.matches.sync(accountId32);
    const cooldown = await this.cooldown(accountId32);
    let waitMs: number | null = null;
    if (res.ok) {
      if (!res.value.backfillComplete) waitMs = cooldown;
    } else if (res.error.type === "cooldown" && "retryAt" in res.error) {
      waitMs = Math.max(cooldown, res.error.retryAt.getTime() - this.now());
    } else if (res.error.type === "sync_in_progress") {
      waitMs = BUSY_RETRY_MS;
    } else {
      // Upstream trouble: fail so the queue retries this chunk.
      throw new Error(`match sync failed: ${res.error.type}`);
    }
    if (waitMs !== null && chunk < MAX_BACKFILL_CHUNKS)
      await this.enqueueMatchBackfill(accountId32, { chunk: chunk + 1, delayMs: waitMs });
  }

  /** Refresh the draft AI's cached tournament data (explorer queries). */
  async warmDraftData(): Promise<void> {
    const results = await this.deps.warmDraftData();
    const failed = results.filter((r) => !r.ok).map((r) => r.key);
    this.deps.logger.info("draft_meta_refreshed", { results });
    if (failed.length) throw new Error(`draft data refresh failed: ${failed.join(", ")}`);
  }

  /** Refresh the Meta page's cached tournament queries. */
  async warmMeta(): Promise<void> {
    const results = await this.deps.warmMeta();
    const failed = results.filter((r) => !r.ok).map((r) => r.key);
    this.deps.logger.info("meta_caches_refreshed", { results });
    if (failed.length) throw new Error(`meta cache refresh failed: ${failed.join(", ")}`);
  }

  /** One go-live alert run; throws (so the queue retries) only when the run itself fails. */
  async runStreamerAlerts(): Promise<Record<string, unknown> | null> {
    if (!this.deps.streamerAlerts) return null;
    const run = await this.deps.streamerAlerts();
    // Quiet when there was nothing to do (most runs), so logs stay small.
    if (!run.skipped) this.deps.logger.info("streamer_alerts_run", run);
    return run;
  }

  private now() {
    return this.deps.now?.() ?? Date.now();
  }
}
