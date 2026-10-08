import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { NOTIFICATIONS_COLLECTIONS, type PushSubscriptionDocument } from "../notifications.model";
import type { StoredSubscription, SubscriptionsRepositoryPort } from "../notifications.ports";

export class PushSubscriptionsRepository implements SubscriptionsRepositoryPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<PushSubscriptionDocument>(
      NOTIFICATIONS_COLLECTIONS.subscriptions,
    );
  }

  async ensureIndexes(): Promise<void> {
    await (await this.col()).createIndex({ userId: 1 }, { name: "by_user" });
  }

  /** The endpoint is the key: a device that signs in as someone else moves to them. */
  async save(sub: StoredSubscription & { userAgent: string | null }, now: Date): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: sub.endpoint },
      {
        $set: { userId: sub.userId, keys: sub.keys, userAgent: sub.userAgent },
        $setOnInsert: { createdAt: now, lastSentAt: null },
      },
      { upsert: true },
    );
  }

  async remove(userId: string, endpoint: string): Promise<boolean> {
    return (await (await this.col()).deleteOne({ _id: endpoint, userId })).deletedCount > 0;
  }

  async removeEndpoint(endpoint: string): Promise<void> {
    await (await this.col()).deleteOne({ _id: endpoint });
  }

  async forUser(userId: string): Promise<StoredSubscription[]> {
    const docs = await (await this.col()).find({ userId }).toArray();
    return docs.map((d) => ({ endpoint: d._id, userId: d.userId, keys: d.keys }));
  }

  async subscribedUserIds(): Promise<string[]> {
    return (await (await this.col()).distinct("userId")).map(String);
  }

  async markSent(endpoints: readonly string[], now: Date): Promise<void> {
    if (endpoints.length === 0) return;
    await (
      await this.col()
    ).updateMany({ _id: { $in: [...endpoints] } }, { $set: { lastSentAt: now } });
  }

  /** Exported without the push keys (they're secrets for that device only). */
  async exportForOwner(owner: DataOwner) {
    const docs = await (
      await this.col()
    )
      .find({ userId: owner.userId }, { projection: { keys: 0 } })
      .toArray();
    return forExport(docs);
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
