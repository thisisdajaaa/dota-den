import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { FreeTrial } from "../domain/trial";
import { PLUS_COLLECTIONS, PLUS_SCHEMA_VERSION, type TrialDocument } from "../plus.model";
import type { TrialsPort } from "../plus.ports";

const trialKey = (accountId32: number) => `steam:${accountId32}`;

const toTrial = (d: TrialDocument): FreeTrial => ({
  userId: d.userId,
  accountId32: d.accountId32,
  startedAt: d.startedAt,
  endsAt: d.endsAt,
});

/** Free Plus trials, one document per Steam account. */
export class TrialsRepository implements TrialsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<TrialDocument>(PLUS_COLLECTIONS.trials);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex({ userId: 1 }, { name: "by_user" });
    await col.createIndex({ endsAt: 1 }, { name: "by_ends_at" });
  }

  async find(userId: string, accountId32?: number) {
    const doc = await (
      await this.col()
    ).findOne(
      accountId32 === undefined
        ? { userId }
        : { $or: [{ _id: trialKey(accountId32) }, { userId }] },
    );
    return doc ? toTrial(doc) : null;
  }

  async start(trial: FreeTrial): Promise<boolean> {
    try {
      await (
        await this.col()
      ).insertOne({
        _id: trialKey(trial.accountId32),
        ...trial,
        schemaVersion: PLUS_SCHEMA_VERSION,
      });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }

  async activeUserIds(now: Date) {
    const docs = await (
      await this.col()
    )
      .find({ endsAt: { $gt: now } }, { projection: { userId: 1 } })
      .limit(100_000)
      .toArray();
    return docs.map((d) => d.userId);
  }

  async counts(now: Date) {
    const col = await this.col();
    const [started, active] = await Promise.all([
      col.estimatedDocumentCount(),
      col.countDocuments({ endsAt: { $gt: now } }),
    ]);
    return { started, active };
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
