import { ObjectId, type Collection, type Db } from "mongodb";
import type { JobRunRepository, JobRunStart } from "../application/ports";
import type { JobName } from "../domain/job";

interface JobRunDoc {
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

const COLLECTION = "job_runs";
const KEEP_MS = 14 * 24 * 3_600_000;

/** One document per attempt; a dedup key that already succeeded is never run again. */
export class MongoJobRunRepository implements JobRunRepository {
  private readonly runs: Collection<JobRunDoc>;

  constructor(db: Db) {
    this.runs = db.collection<JobRunDoc>(COLLECTION);
  }

  async begin(name: JobName, dedupKey: string | null, now: Date): Promise<JobRunStart> {
    if (dedupKey) {
      const done = await this.runs.findOne(
        { name, dedupKey, status: "succeeded" },
        { projection: { _id: 1 } },
      );
      if (done) return { status: "already_done" };
    }
    const _id = new ObjectId();
    await this.runs.insertOne({
      _id,
      name,
      dedupKey,
      status: "running",
      error: null,
      startedAt: now,
      finishedAt: null,
      expiresAt: new Date(now.getTime() + KEEP_MS),
    });
    return { status: "started", runId: _id.toHexString() };
  }

  async finish(
    runId: string,
    outcome: { ok: true } | { ok: false; error: string },
    now: Date,
  ): Promise<void> {
    await this.runs.updateOne(
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
}

export async function ensureJobIndexes(db: Db): Promise<void> {
  const runs = db.collection<JobRunDoc>(COLLECTION);
  await Promise.all([
    runs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
    runs.createIndex({ name: 1, dedupKey: 1, status: 1 }, { name: "by_dedup" }),
  ]);
}

/** Admin overview: the latest failed job runs. */
export async function recentJobFailures(
  db: Db,
  limit = 10,
): Promise<Array<{ name: string; error: string | null; at: Date; dedupKey: string | null }>> {
  const docs = await db
    .collection<JobRunDoc>(COLLECTION)
    .find({ status: "failed" })
    .sort({ startedAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map((d) => ({ name: d.name, error: d.error, at: d.startedAt, dedupKey: d.dedupKey }));
}
