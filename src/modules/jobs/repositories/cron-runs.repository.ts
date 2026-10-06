import "server-only";
import { ObjectId, type Db } from "mongodb";
import {
  CRON_RUN_RETENTION_S,
  CRON_RUNS_COLLECTION,
  type CronRun,
  type CronRunDocument,
} from "../jobs.model";
import type { CronRunsRepositoryPort } from "../jobs.ports";

export class CronRunsRepository implements CronRunsRepositoryPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<CronRunDocument>(CRON_RUNS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ startedAt: 1 }, { expireAfterSeconds: CRON_RUN_RETENTION_S, name: "ttl_30d" });
  }

  async start(name: string, trigger: string): Promise<string> {
    const _id = new ObjectId();
    await (
      await this.col()
    ).insertOne({
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

  async finish(id: string, result: { ok: boolean; summary: Record<string, unknown> }) {
    await (
      await this.col()
    ).updateOne({ _id: new ObjectId(id) }, { $set: { ...result, finishedAt: new Date() } });
  }

  async recent(limit = 10): Promise<CronRun[]> {
    const docs = await (await this.col()).find({}).sort({ startedAt: -1 }).limit(limit).toArray();
    return docs.map(({ _id, ...rest }) => ({ id: _id.toHexString(), ...rest }));
  }
}
