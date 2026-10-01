import { ObjectId, type Db } from "mongodb";

const COLLECTION = "cron_runs";
const RETENTION_S = 30 * 24 * 3600;

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

interface CronRunDoc extends Omit<CronRun, "id"> {
  _id: ObjectId;
}

export async function ensureCronRunIndexes(db: Db): Promise<void> {
  await db
    .collection(COLLECTION)
    .createIndex({ startedAt: 1 }, { expireAfterSeconds: RETENTION_S, name: "ttl_30d" });
}

/** Written first, so a run that's cut off (timeout) still shows up as started. */
export async function startCronRun(db: Db, name: string, trigger: string): Promise<string> {
  const _id = new ObjectId();
  await db.collection<CronRunDoc>(COLLECTION).insertOne({
    _id,
    name,
    trigger,
    startedAt: new Date(),
    finishedAt: null,
    ok: null,
    summary: null,
  });
  return _id.toHexString();
}

export async function finishCronRun(
  db: Db,
  id: string,
  result: { ok: boolean; summary: Record<string, unknown> },
): Promise<void> {
  await db
    .collection<CronRunDoc>(COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, { $set: { ...result, finishedAt: new Date() } });
}

export async function recentCronRuns(db: Db, limit = 10): Promise<CronRun[]> {
  const docs = await db
    .collection<CronRunDoc>(COLLECTION)
    .find({})
    .sort({ startedAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(({ _id, ...rest }) => ({ id: _id.toHexString(), ...rest }));
}
