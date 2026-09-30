import "server-only";
import { Client, Receiver } from "@upstash/qstash";
import { after } from "next/server";
import { getDb } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { draftInsights } from "@/modules/drafts/composition";
import { BACKFILL_COOLDOWN_MS } from "@/modules/matches/application/match-sync-service";
import { getMatchSyncService } from "@/modules/matches/composition";
import { JobRunner } from "./application/job-runner";
import type { JobHandler, JobQueue } from "./application/ports";
import { bucketedKey, type JobName } from "./domain/job";
import { InlineJobQueue } from "./infrastructure/inline-job-queue";
import { MongoJobRunRepository } from "./infrastructure/mongo-job-runs";
import { QStashJobQueue } from "./infrastructure/qstash-job-queue";

/** A long history is imported in chunks; stop chaining after this many (a safety net). */
const MAX_BACKFILL_CHUNKS = 300;

const handlers: Record<JobName, JobHandler> = {
  /** One chunk of a match-history import; queues the next chunk while history remains. */
  "match-backfill": async (payload) => {
    const accountId32 = Number(payload.accountId32);
    const chunk = Number(payload.chunk ?? 0);
    if (!Number.isInteger(accountId32) || accountId32 <= 0) return;
    const res = await (await getMatchSyncService()).sync(accountId32);
    let waitMs: number | null = null;
    if (res.ok) {
      if (!res.value.backfillComplete) waitMs = BACKFILL_COOLDOWN_MS;
    } else if (res.error.type === "cooldown") {
      waitMs = Math.max(BACKFILL_COOLDOWN_MS, res.error.retryAt.getTime() - Date.now());
    } else if (res.error.type === "sync_in_progress") {
      waitMs = 60_000; // someone else is syncing right now; check back
    } else {
      // Upstream trouble: fail so the queue retries this chunk.
      throw new Error(`match sync failed: ${res.error.type}`);
    }
    if (waitMs !== null && chunk < MAX_BACKFILL_CHUNKS) {
      await enqueueMatchBackfill(accountId32, { chunk: chunk + 1, delayMs: waitMs });
    }
  },
  /** Refresh the draft AI's cached tournament data (explorer queries). */
  "draft-meta-warm": async () => {
    const results = await (await draftInsights()).warm();
    const failed = results.filter((r) => !r.ok).map((r) => r.key);
    logger.info("draft_meta_refreshed", { results });
    if (failed.length) throw new Error(`draft data refresh failed: ${failed.join(", ")}`);
  },
};

export async function getJobRunner(): Promise<JobRunner> {
  return new JobRunner({ handlers, runs: new MongoJobRunRepository(await getDb()) });
}

/** QStash when configured (durable, retried, can wait); otherwise in-process after the response. */
export function getJobQueue(): JobQueue {
  const { QSTASH_TOKEN, QSTASH_URL, APP_URL, VERCEL_AUTOMATION_BYPASS_SECRET: bypass } = env();
  if (QSTASH_TOKEN) {
    return new QStashJobQueue(new Client({ token: QSTASH_TOKEN, baseUrl: QSTASH_URL }), {
      appUrl: APP_URL,
      // Vercel deployment protection (staging) needs the automation bypass header.
      headers: bypass ? { "x-vercel-protection-bypass": bypass } : undefined,
    });
  }
  return new InlineJobQueue({
    run: async (name, payload, dedupKey) => {
      const outcome = await (await getJobRunner()).run(name, payload, dedupKey);
      if (outcome.status === "failed") logger.warn("job_failed", { name, error: outcome.error });
    },
    schedule: (task) => after(task),
  });
}

/** Verifies that a job request really came from QStash; null when QStash isn't configured. */
export function getJobReceiver(): Receiver | null {
  const { QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY } = env();
  if (!QSTASH_TOKEN || !QSTASH_CURRENT_SIGNING_KEY) return null;
  return new Receiver({
    currentSigningKey: QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: QSTASH_NEXT_SIGNING_KEY ?? QSTASH_CURRENT_SIGNING_KEY,
  });
}

/**
 * Continue a match-history import in the background (durable queue only: without QStash the
 * import continues on the player's next sync, as before).
 */
export async function enqueueMatchBackfill(
  accountId32: number,
  opts: { chunk?: number; delayMs?: number } = {},
): Promise<void> {
  const queue = getJobQueue();
  if (!queue.durable) return;
  const delayMs = opts.delayMs ?? BACKFILL_COOLDOWN_MS;
  await queue.enqueue(
    "match-backfill",
    { accountId32, chunk: opts.chunk ?? 0 },
    {
      // One chunk per account per minute, whoever asks.
      dedupKey: bucketedKey(`backfill:${accountId32}`, 60_000, Date.now() + delayMs),
      delaySec: Math.ceil(delayMs / 1000),
    },
  );
}
