import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { EMAIL_COLLECTIONS, emailLogId, type EmailLogDocument } from "../email.model";
import type { EmailLogPort } from "../email.ports";

/** Kept for 90 days: long enough that a weekly email never repeats. */
const LOG_TTL_SECONDS = 90 * 24 * 3600;

/** Same once-only claim as notification_log (ADR 0010): inserting the id is the claim. */
export class EmailLogRepository implements EmailLogPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<EmailLogDocument>(EMAIL_COLLECTIONS.log);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex({ userId: 1 }, { name: "by_user" });
    await col.createIndex({ sentAt: 1 }, { name: "ttl", expireAfterSeconds: LOG_TTL_SECONDS });
  }

  async claim(userId: string, kind: string, key: string, now: Date): Promise<boolean> {
    try {
      await (
        await this.col()
      ).insertOne({
        _id: emailLogId(userId, kind, key),
        userId,
        kind,
        key,
        sentAt: now,
        providerId: null,
      });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }

  async release(userId: string, kind: string, key: string): Promise<void> {
    await (await this.col()).deleteOne({ _id: emailLogId(userId, kind, key) });
  }

  async recordSent(userId: string, kind: string, key: string, providerId: string | null) {
    await (
      await this.col()
    ).updateOne({ _id: emailLogId(userId, kind, key) }, { $set: { providerId } });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
