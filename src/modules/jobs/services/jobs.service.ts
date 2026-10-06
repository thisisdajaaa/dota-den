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
      /** Wait between history chunks (the sync cooldown). */
      backfillCooldownMs: number;
      warmDraftData: () => Promise<Array<{ key: string; ok: boolean }>>;
      logger: Pick<Logger, "info">;
      now?: () => number;
    },
  ) {}

  /** Handlers by job name, for the job runner. */
  handlers(): Record<JobName, JobHandler> {
    return {
      "match-backfill": (payload) => this.backfillChunk(payload),
      "draft-meta-warm": () => this.warmDraftData(),
    };
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
    const delayMs = opts.delayMs ?? this.deps.backfillCooldownMs;
    await queue.enqueue(
      "match-backfill",
      { accountId32, chunk: opts.chunk ?? 0 },
      {
        // One chunk per account per minute, whoever asks.
        dedupKey: bucketedKey(`backfill:${accountId32}`, 60_000, this.now() + delayMs),
        delaySec: Math.ceil(delayMs / 1000),
      },
    );
  }

  /** One chunk of a match-history import; queues the next chunk while history remains. */
  async backfillChunk(payload: Record<string, unknown>): Promise<void> {
    const accountId32 = Number(payload.accountId32);
    const chunk = Number(payload.chunk ?? 0);
    if (!Number.isInteger(accountId32) || accountId32 <= 0) return;
    const res = await this.deps.matches.sync(accountId32);
    const cooldown = this.deps.backfillCooldownMs;
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

  private now() {
    return this.deps.now?.() ?? Date.now();
  }
}
