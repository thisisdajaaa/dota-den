import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { DISCORD_COLLECTIONS, discordPostId, type DiscordPostLogDocument } from "../discord.model";
import type { PostLogPort } from "../discord.ports";

/** Kept for 90 days: far longer than a match stays postable (see MAX_MATCH_AGE_MS). */
const LOG_TTL_SECONDS = 90 * 24 * 3600;

export class DiscordPostLogRepository implements PostLogPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<DiscordPostLogDocument>(DISCORD_COLLECTIONS.log);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex({ userId: 1, startedAt: -1 }, { name: "by_user_started" });
    await col.createIndex({ claimedAt: 1 }, { name: "ttl", expireAfterSeconds: LOG_TTL_SECONDS });
  }

  /** Inserting the id (`user:match`) is the claim: a duplicate key means it's taken. */
  async claim(userId: string, matchId: string, startedAt: Date, now: Date): Promise<boolean> {
    try {
      await (
        await this.col()
      ).insertOne({
        _id: discordPostId(userId, matchId),
        userId,
        matchId,
        startedAt,
        claimedAt: now,
        sentAt: null,
      });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }

  async release(userId: string, matchIds: readonly string[]): Promise<void> {
    if (matchIds.length === 0) return;
    await (
      await this.col()
    ).deleteMany({ _id: { $in: matchIds.map((m) => discordPostId(userId, m)) }, sentAt: null });
  }

  async markSent(userId: string, matchIds: readonly string[], now: Date): Promise<void> {
    if (matchIds.length === 0) return;
    await (
      await this.col()
    ).updateMany(
      { _id: { $in: matchIds.map((m) => discordPostId(userId, m)) } },
      { $set: { sentAt: now } },
    );
  }

  async claimedSince(userId: string, from: Date): Promise<string[]> {
    const docs = await (
      await this.col()
    )
      .find({ userId, startedAt: { $gte: from } }, { projection: { matchId: 1 } })
      .toArray();
    return docs.map((d) => d.matchId);
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
