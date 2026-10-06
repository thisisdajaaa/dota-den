import type { JobMessage, JobName } from "./domain/job";

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

/** Runs of scheduled (cron) jobs, for the admin page. */
export interface CronRunsRepositoryPort {
  /** Written first, so a run that's cut off (timeout) still shows up as started. */
  start(name: string, trigger: string): Promise<string>;
  finish(id: string, result: { ok: boolean; summary: Record<string, unknown> }): Promise<void>;
}

/** What the jobs feature needs from the matches feature. */
export interface MatchSyncPort {
  sync(accountId32: number): Promise<
    | { ok: true; value: { backfillComplete: boolean } }
    | {
        ok: false;
        error: { type: "cooldown"; retryAt: Date } | { type: Exclude<string, "cooldown"> };
      }
  >;
  syncDue(opts: {
    limit: number;
    budgetMs: number;
    maxPages: number;
  }): Promise<Array<{ accountId32: number; outcome: string }>>;
}

export interface MedalPort {
  /** The player's current medal from their public profile, or undefined when unavailable. */
  currentRankTier(accountId32: number): Promise<{ rankTier: number | null } | null>;
  record(accountId32: number, rankTier: number | null): Promise<void>;
}

export interface PatchImportPort {
  importLatest(): Promise<
    | { ok: true; value: Array<{ outcome: string }> }
    | { ok: false; error: { error: { type: string } } }
  >;
}

/** Slow tournament queries cached ahead of time (draft AI and the Meta page). */
export interface CacheWarmPort {
  warmDraftData(): Promise<Array<{ key: string; ok: boolean }>>;
  warmMeta(): Promise<Array<{ key: string; ok: boolean }>>;
}
