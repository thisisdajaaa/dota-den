import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { DISCORD_COLLECTIONS, type DiscordWebhookDocument } from "../discord.model";
import type { StoredFeed, WebhooksRepositoryPort } from "../discord.ports";

function toFeed(d: DiscordWebhookDocument): StoredFeed {
  return {
    userId: d._id,
    accountId32: d.accountId32,
    target: { origin: d.origin, id: d.webhookId, token: d.token },
    name: d.name,
    channelId: d.channelId,
    enabled: d.enabled,
    gone: d.gone,
    since: d.since,
    lastPostedAt: d.lastPostedAt,
  };
}

export class DiscordWebhooksRepository implements WebhooksRepositoryPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<DiscordWebhookDocument>(DISCORD_COLLECTIONS.webhooks);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex({ accountId32: 1 }, { name: "by_account" });
    await col.createIndex({ enabled: 1, gone: 1 }, { name: "active" });
  }

  async get(userId: string): Promise<StoredFeed | null> {
    const doc = await (await this.col()).findOne({ _id: userId });
    return doc ? toFeed(doc) : null;
  }

  async byAccount(accountId32: number): Promise<StoredFeed | null> {
    const doc = await (await this.col()).findOne({ accountId32 });
    return doc ? toFeed(doc) : null;
  }

  async active(): Promise<StoredFeed[]> {
    return (await (await this.col()).find({ enabled: true, gone: false }).toArray()).map(toFeed);
  }

  async save(
    feed: Omit<StoredFeed, "enabled" | "gone" | "since" | "lastPostedAt">,
    now: Date,
  ): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: feed.userId },
      {
        $set: {
          accountId32: feed.accountId32,
          origin: feed.target.origin,
          webhookId: feed.target.id,
          token: feed.target.token,
          name: feed.name,
          channelId: feed.channelId,
          enabled: true,
          gone: false,
          since: now,
          lastPostedAt: null,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  async setEnabled(userId: string, enabled: boolean, now: Date): Promise<boolean> {
    const col = await this.col();
    if (!enabled) {
      const res = await col.updateOne({ _id: userId }, { $set: { enabled, updatedAt: now } });
      return res.matchedCount > 0;
    }
    // Only a feed that was off starts a new window; turning on twice keeps the first.
    const res = await col.updateOne(
      { _id: userId, gone: false, enabled: false },
      { $set: { enabled, since: now, updatedAt: now } },
    );
    if (res.matchedCount > 0) return true;
    return (await col.countDocuments({ _id: userId, gone: false, enabled: true })) > 0;
  }

  async markGone(userId: string, now: Date): Promise<void> {
    await (
      await this.col()
    ).updateOne({ _id: userId }, { $set: { gone: true, enabled: false, updatedAt: now } });
  }

  async markPosted(userId: string, now: Date): Promise<void> {
    await (await this.col()).updateOne({ _id: userId }, { $set: { lastPostedAt: now } });
  }

  async remove(userId: string): Promise<boolean> {
    return (await (await this.col()).deleteOne({ _id: userId })).deletedCount > 0;
  }

  /** Exported without the token (it's a secret: anyone with it can post to the channel). */
  async exportForOwner(owner: DataOwner) {
    const docs = await (
      await this.col()
    )
      .find({ _id: owner.userId }, { projection: { token: 0 } })
      .toArray();
    return forExport(docs);
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ _id: owner.userId })).deletedCount;
  }
}
