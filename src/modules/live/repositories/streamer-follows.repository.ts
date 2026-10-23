import type { Db } from "mongodb";
import "server-only";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { Platform } from "../domain/platform";
import type { StreamerFollow } from "../domain/streams";
import { LIVE_COLLECTIONS, LIVE_SCHEMA_VERSION, type StreamerFollowDoc } from "../live.model";
import type { StreamerFollowsPort } from "../live.ports";

const toFollow = (d: StreamerFollowDoc): StreamerFollow => ({
  userId: d.userId,
  platform: d.platform,
  channelId: d.channelId,
  login: d.login,
  displayName: d.displayName,
  avatarUrl: d.avatarUrl ?? null,
  createdAt: d.createdAt,
});

/** Followed channels on every streaming site, per user. */
export class StreamerFollowsRepository implements StreamerFollowsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<StreamerFollowDoc>(LIVE_COLLECTIONS.streamerFollows);
  }

  async add(follow: StreamerFollow): Promise<boolean> {
    const { userId, platform, channelId, createdAt, login, displayName, avatarUrl } = follow;
    // Upsert keeps it idempotent; the unique index settles concurrent inserts.
    try {
      const res = await (
        await this.col()
      ).updateOne(
        { userId, platform, channelId },
        {
          $setOnInsert: {
            userId,
            platform,
            channelId,
            createdAt,
            schemaVersion: LIVE_SCHEMA_VERSION,
          },
          // Channels rename: a repeat follow refreshes the names.
          $set: { login, displayName, avatarUrl, updatedAt: createdAt },
        },
        { upsert: true },
      );
      return res.upsertedCount === 1;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return false;
      throw e;
    }
  }

  async remove(userId: string, platform: Platform, channelId: string): Promise<boolean> {
    const res = await (await this.col()).deleteOne({ userId, platform, channelId });
    return res.deletedCount === 1;
  }

  async list(userId: string): Promise<StreamerFollow[]> {
    const docs = await (
      await this.col()
    )
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(1_000)
      .toArray();
    return docs.map(toFollow);
  }

  /** Every follow of these users (go-live alerts). */
  async forUsers(userIds: readonly string[]): Promise<StreamerFollow[]> {
    if (userIds.length === 0) return [];
    const docs = await (
      await this.col()
    )
      .find({ userId: { $in: [...new Set(userIds)] } })
      .limit(200_000)
      .toArray();
    return docs.map(toFollow);
  }

  async count(userId: string): Promise<number> {
    return (await this.col()).countDocuments({ userId });
  }

  async find(
    userId: string,
    platform: Platform,
    channelId: string,
  ): Promise<StreamerFollow | null> {
    const doc = await (await this.col()).findOne({ userId, platform, channelId });
    return doc ? toFollow(doc) : null;
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex(
      { userId: 1, platform: 1, channelId: 1 },
      { name: "by_user_platform_channel", unique: true },
    );
    // Serves the per-user list (newest first) and counts.
    await col.createIndex({ userId: 1, createdAt: -1 }, { name: "by_user_recent" });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
