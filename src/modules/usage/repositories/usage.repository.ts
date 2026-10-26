import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { USAGE_RETENTION_DAYS, usageDay, type Feature, type UsageRow } from "../domain/usage";
import { USAGE_COLLECTION, type FeatureUsageDocument } from "../usage.model";
import type { UsagePort } from "../usage.ports";

export class UsageRepository implements UsagePort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<FeatureUsageDocument>(USAGE_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex(
        { dayStart: 1 },
        { expireAfterSeconds: USAGE_RETENTION_DAYS * 86_400, name: "ttl_90d" },
      ),
      col.createIndex({ day: 1 }, { name: "by_day" }),
      col.createIndex({ userId: 1 }, { name: "by_user" }),
    ]);
  }

  async record(feature: Feature, userId: string, at: Date): Promise<void> {
    const day = usageDay(at);
    await (
      await this.col()
    ).updateOne(
      { _id: `${day}:${feature}:${userId}` },
      {
        $inc: { count: 1 },
        $setOnInsert: {
          day,
          feature,
          userId,
          dayStart: new Date(`${day}T00:00:00Z`),
          schemaVersion: 1,
        },
      },
      { upsert: true },
    );
  }

  async rowsSince(day: string): Promise<UsageRow[]> {
    const docs = await (
      await this.col()
    )
      .find({ day: { $gte: day } }, { projection: { day: 1, feature: 1, userId: 1, count: 1 } })
      .toArray();
    return docs.map((d) => ({ day: d.day, feature: d.feature, userId: d.userId, count: d.count }));
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
