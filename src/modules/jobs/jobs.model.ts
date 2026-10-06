import type { ObjectId } from "mongodb";
import type { JobName } from "./domain/job";

export const JOB_RUNS_COLLECTION = "job_runs";
/** Job runs are kept two weeks for troubleshooting. */
export const JOB_RUN_KEEP_MS = 14 * 24 * 3_600_000;

export interface JobRunDocument {
  _id: ObjectId;
  name: JobName;
  dedupKey: string | null;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  /** TTL: runs are kept for troubleshooting, then dropped. */
  expiresAt: Date;
}

export interface JobFailure {
  name: string;
  error: string | null;
  at: Date;
  dedupKey: string | null;
}

export const CRON_RUNS_COLLECTION = "cron_runs";
export const CRON_RUN_RETENTION_S = 30 * 24 * 3600;

export interface CronRun {
  id: string;
  name: string;
  /** "cron" (Vercel's schedule) or "admin" (run from the admin page). */
  trigger: string;
  startedAt: Date;
  /** Null while running, or if the run was cut off before it finished. */
  finishedAt: Date | null;
  ok: boolean | null;
  summary: Record<string, unknown> | null;
}

export interface CronRunDocument extends Omit<CronRun, "id"> {
  _id: ObjectId;
}
