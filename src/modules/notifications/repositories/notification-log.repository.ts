import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { NotificationKind } from "../domain/notification";
import {
  NOTIFICATIONS_COLLECTIONS,
  notificationLogId,
  type NotificationLogDocument,
} from "../notifications.model";
import type { NotificationLogPort } from "../notifications.ports";

/** Kept for 90 days: long enough that a weekly or patch notification never repeats. */
const LOG_TTL_SECONDS = 90 * 24 * 3600;

export class NotificationLogRepository implements NotificationLogPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<NotificationLogDocument>(NOTIFICATIONS_COLLECTIONS.log);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex({ userId: 1 }, { name: "by_user" });
    await col.createIndex({ sentAt: 1 }, { name: "ttl", expireAfterSeconds: LOG_TTL_SECONDS });
  }

  /** Inserting the id is the claim: a duplicate key means it was already sent. */
  async claim(userId: string, kind: NotificationKind, key: string, now: Date): Promise<boolean> {
    try {
      await (
        await this.col()
      ).insertOne({
        _id: notificationLogId(userId, kind, key),
        userId,
        kind,
        key,
        sentAt: now,
        delivered: 0,
      });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }

  async release(userId: string, kind: NotificationKind, key: string): Promise<void> {
    await (await this.col()).deleteOne({ _id: notificationLogId(userId, kind, key) });
  }

  async recordDelivered(userId: string, kind: NotificationKind, key: string, n: number) {
    await (
      await this.col()
    ).updateOne({ _id: notificationLogId(userId, kind, key) }, { $set: { delivered: n } });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
