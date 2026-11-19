import { randomUUID } from "node:crypto";
import { MongoServerError, type Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import {
  conversationTitle,
  type AskConversationSummary,
  type AskMessage,
} from "../domain/ask-chat";
import type { AskChatsPort, AskUsagePort } from "../assistant.ports";
import {
  ASK_CHATS_COLLECTION,
  ASK_USAGE_COLLECTION,
  type AskChatDoc,
  type AskUsageDoc,
} from "../assistant.model";

/**
 * Ask Den's conversations: one document per conversation, owned by `userId`. Every read and
 * write filters on the owner as well as the id, so a conversation id alone opens nothing.
 * A legacy single chat (`_id` = the user id, no title) still shows as a conversation.
 */
export class AskChatsRepository implements AskChatsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<AskChatDoc>(ASK_CHATS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
      col.createIndex({ userId: 1, updatedAt: -1 }, { name: "by_user_recent" }),
    ]);
  }

  async list(userId: string, limit: number): Promise<AskConversationSummary[]> {
    const now = new Date();
    const docs = await (
      await this.col()
    )
      .aggregate<{
        _id: string;
        title?: string;
        first?: string;
        updatedAt: Date;
        count: number;
      }>([
        { $match: { userId, expiresAt: { $gt: now } } },
        { $sort: { updatedAt: -1 } },
        { $limit: limit },
        {
          $project: {
            title: 1,
            updatedAt: 1,
            count: { $size: "$messages" },
            first: { $arrayElemAt: ["$messages.text", 0] },
          },
        },
      ])
      .toArray();
    return docs.map((d) => ({
      id: d._id,
      title: d.title || conversationTitle(d.first ?? ""),
      updatedAt: d.updatedAt,
      messages: d.count,
    }));
  }

  async get(userId: string, id: string): Promise<AskMessage[] | null> {
    const doc = await (await this.col()).findOne({ _id: id, userId });
    // The TTL monitor runs about once a minute: an expired chat is already gone for the player.
    if (!doc || doc.expiresAt.getTime() <= Date.now()) return null;
    return doc.messages.map((m) => ({ ...m }));
  }

  async create(
    userId: string,
    messages: readonly AskMessage[],
    opts: { title: string; now: Date; expiresAt: Date; maxConversations: number },
  ): Promise<string> {
    const col = await this.col();
    const id = randomUUID();
    await col.insertOne({
      _id: id,
      schemaVersion: 1,
      userId,
      title: opts.title,
      messages: [...messages],
      updatedAt: opts.now,
      expiresAt: opts.expiresAt,
    });
    // Keep the newest few: anything past the cap is forgotten. The new one always stays (two
    // created in the same millisecond tie on updatedAt).
    const old = await col
      .find({ userId, _id: { $ne: id } }, { projection: { _id: 1 } })
      .sort({ updatedAt: -1, _id: 1 })
      .skip(Math.max(0, opts.maxConversations - 1))
      .toArray();
    if (old.length) await col.deleteMany({ userId, _id: { $in: old.map((d) => d._id) } });
    return id;
  }

  async append(
    userId: string,
    id: string,
    messages: readonly AskMessage[],
    opts: { keep: number; now: Date; expiresAt: Date },
  ): Promise<boolean> {
    const res = await (
      await this.col()
    ).updateOne(
      { _id: id, userId },
      {
        $push: { messages: { $each: [...messages], $slice: -opts.keep } },
        $set: { updatedAt: opts.now, expiresAt: opts.expiresAt },
      },
    );
    return res.matchedCount === 1;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return (await (await this.col()).deleteOne({ _id: id, userId })).deletedCount === 1;
  }

  async clear(userId: string): Promise<void> {
    await (await this.col()).deleteMany({ userId });
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

  async release(
    userId: string,
    day: string,
    opts?: { fallback: true; maxFallbacks: number },
  ): Promise<boolean> {
    const res = await (
      await this.col()
    ).updateOne(
      {
        _id: `${userId}:${day}`,
        count: { $gt: 0 },
        // One atomic check: a fallback is given back only under the day's allowance.
        ...(opts ? { fallbacks: { $not: { $gte: opts.maxFallbacks } } } : {}),
      },
      { $inc: { count: -1, ...(opts ? { fallbacks: 1 } : {}) } },
    );
    return res.modifiedCount === 1;
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
