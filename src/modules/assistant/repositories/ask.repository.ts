import { MongoServerError, type Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { AskMessage } from "../domain/ask-chat";
import type { AskChatsPort, AskUsagePort } from "../assistant.ports";
import {
  ASK_CHATS_COLLECTION,
  ASK_USAGE_COLLECTION,
  type AskChatDoc,
  type AskUsageDoc,
} from "../assistant.model";

/** Ask Den's chat history: one document per user, capped and removed by TTL. */
export class AskChatsRepository implements AskChatsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<AskChatDoc>(ASK_CHATS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" });
  }

  async get(userId: string): Promise<AskMessage[]> {
    const doc = await (await this.col()).findOne({ _id: userId });
    // The TTL monitor runs about once a minute: an expired chat is already gone for the player.
    if (!doc || doc.expiresAt.getTime() <= Date.now()) return [];
    return doc.messages.map((m) => ({ ...m }));
  }

  async append(
    userId: string,
    messages: readonly AskMessage[],
    opts: { keep: number; now: Date; expiresAt: Date },
  ): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: userId },
      {
        $push: { messages: { $each: [...messages], $slice: -opts.keep } },
        $set: { updatedAt: opts.now, expiresAt: opts.expiresAt },
        $setOnInsert: { schemaVersion: 1, userId },
      },
      { upsert: true },
    );
  }

  async clear(userId: string): Promise<void> {
    await (await this.col()).deleteOne({ _id: userId });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}

const isDuplicateKey = (e: unknown) => e instanceof MongoServerError && e.code === 11000;

/** Questions per user and Manila day; one document per pair, removed by TTL. */
export class AskUsageRepository implements AskUsagePort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<AskUsageDoc>(ASK_USAGE_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
      col.createIndex({ userId: 1 }, { name: "by_user" }),
    ]);
  }

  async used(userId: string, day: string): Promise<number> {
    return (await (await this.col()).findOne({ _id: `${userId}:${day}` }))?.count ?? 0;
  }

  /**
   * One atomic update: count up only while under the limit. At the limit the filter misses,
   * the upsert's insert hits the existing `_id` and fails (refused). Two first questions of
   * the day racing can also collide on the insert; the loser simply tries the update again.
   */
  async reserve(userId: string, day: string, limit: number, expiresAt: Date): Promise<boolean> {
    const col = await this.col();
    const _id = `${userId}:${day}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await col.updateOne(
          { _id, count: { $lt: limit } },
          {
            $inc: { count: 1 },
            $setOnInsert: { schemaVersion: 1, userId, day, expiresAt },
          },
          { upsert: true },
        );
        return res.modifiedCount + res.upsertedCount === 1;
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
      }
    }
    return false;
  }

  async release(userId: string, day: string): Promise<void> {
    await (
      await this.col()
    ).updateOne({ _id: `${userId}:${day}`, count: { $gt: 0 } }, { $inc: { count: -1 } });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
