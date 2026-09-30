import type { JobMessage, JobName } from "../domain/job";

export interface EnqueueOptions {
  dedupKey?: string;
  /** Deliver after this many seconds. Only a durable queue can wait; see InlineJobQueue. */
  delaySec?: number;
}

/** "queued": handed to the durable queue. "inline": runs after this response. "skipped". */
export type EnqueueResult = "queued" | "inline" | "skipped";

export interface JobQueue {
  readonly durable: boolean;
  enqueue(
    name: JobName,
    payload: Record<string, unknown>,
    opts?: EnqueueOptions,
  ): Promise<EnqueueResult>;
}

export type JobRunStart = { status: "started"; runId: string } | { status: "already_done" };

/** Records of job runs, for idempotency and troubleshooting. */
export interface JobRunRepository {
  begin(name: JobName, dedupKey: string | null, now: Date): Promise<JobRunStart>;
  finish(
    runId: string,
    outcome: { ok: true } | { ok: false; error: string },
    now: Date,
  ): Promise<void>;
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

export type { JobMessage };
