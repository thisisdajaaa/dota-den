/**
 * Background jobs (pure parts). A job is a named piece of work with a small JSON payload.
 * Jobs are idempotent: a dedup key that already succeeded is skipped, so a retried or
 * duplicated delivery does nothing (ADR 0008).
 */

export const JOB_NAMES = ["match-backfill", "draft-meta-warm"] as const;
export type JobName = (typeof JOB_NAMES)[number];

export const isJobName = (v: unknown): v is JobName =>
  typeof v === "string" && (JOB_NAMES as readonly string[]).includes(v);

export interface JobMessage {
  payload: Record<string, unknown>;
  /** Same key, same work: runs once. */
  dedupKey: string | null;
}

/**
 * A dedup key scoped to a time bucket, so the same logical job can run again later (after
 * a failure, or the next day) instead of being remembered forever.
 */
export function bucketedKey(key: string, bucketMs: number, now: number): string {
  return `${key}@${Math.floor(now / bucketMs)}`;
}
