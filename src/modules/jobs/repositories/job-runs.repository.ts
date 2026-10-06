import "server-only";
import { ObjectId, type Db } from "mongodb";
import type { JobName } from "../domain/job";
import {
  JOB_RUN_KEEP_MS,
  JOB_RUNS_COLLECTION,
  type JobFailure,
  type JobRunDocument,
} from "../jobs.model";
import type { JobRunRepository, JobRunStart } from "../jobs.ports";

/** One document per attempt; a dedup key that already succeeded is never run again. */
export class JobRunsRepository implements JobRunRepository {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<JobRunDocument>(JOB_RUNS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    const runs = await this.col();
    await Promise.all([
      runs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
      runs.createIndex({ name: 1, dedupKey: 1, status: 1 }, { name: "by_dedup" }),
    ]);
  }

  async begin(name: JobName, dedupKey: string | null, now: Date): Promise<JobRunStart> {
    const runs = await this.col();
    if (dedupKey) {
      const done = await runs.findOne(
        { name, dedupKey, status: "succeeded" },
        { projection: { _id: 1 } },
      );
      if (done) return { status: "already_done" };
    }
    const _id = new ObjectId();
    await runs.insertOne({
      _id,
      name,
      dedupKey,
      status: "running",
      error: null,
      startedAt: now,
      finishedAt: null,
      expiresAt: new Date(now.getTime() + JOB_RUN_KEEP_MS),
    });
    return { status: "started", runId: _id.toHexString() };
  }

  async finish(
    runId: string,
    outcome: { ok: true } | { ok: false; error: string },
    now: Date,
  ): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: new ObjectId(runId) },
      {
        $set: {
          status: outcome.ok ? "succeeded" : "failed",
          error: outcome.ok ? null : outcome.error.slice(0, 500),
          finishedAt: now,
        },
      },
    );
  }

  /** The latest failed job runs. */
  async recentFailures(limit = 10): Promise<JobFailure[]> {
    const docs = await (
      await this.col()
    )
      .find({ status: "failed" })
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((d) => ({
      name: d.name,
      error: d.error,
      at: d.startedAt,
      dedupKey: d.dedupKey,
    }));
  }
}
