import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { DISCORD_COLLECTIONS, type DiscordBotLogDocument } from "../discord.model";
import type { BotLogPort } from "../discord.ports";

/** Longer than any job retry or companion catch-up; recaps are also guarded by week. */
const LOG_TTL_SECONDS = 30 * 24 * 3600;

/** Bot posts claimed by inserting their id (a duplicate key means it's taken). */
export class DiscordBotLogRepository implements BotLogPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<DiscordBotLogDocument>(DISCORD_COLLECTIONS.botLog);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ claimedAt: 1 }, { name: "ttl", expireAfterSeconds: LOG_TTL_SECONDS }),
      col.createIndex({ userId: 1 }, { name: "by_user", sparse: true }),
    ]);
  }

  async claim(
    id: string,
    who: { userId: string | null; guildId: string | null },
    now: Date,
  ): Promise<boolean> {
    try {
      await (await this.col()).insertOne({ _id: id, ...who, claimedAt: now, sentAt: null });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }

  async release(id: string): Promise<void> {
    await (await this.col()).deleteOne({ _id: id, sentAt: null });
  }

  async markSent(id: string, now: Date): Promise<void> {
    await (await this.col()).updateOne({ _id: id }, { $set: { sentAt: now } });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
