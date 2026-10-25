import "server-only";
import { ObjectId, type Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type {
  CoachReservation,
  CoachReviewKey,
  CoachReviewsPort,
  CoachUsagePort,
  AutoReviewsPort,
  ParseRequestsPort,
  StoredCoachReview,
} from "../matches.ports";
import { MATCH_COLLECTIONS, type PlayerMatchFactDoc } from "./matches.repository";

const SCHEMA_VERSION = 1;
const DAY_MS = 24 * 3_600_000;

const isDuplicateKey = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && e.code === 11000;

export interface CoachReviewDoc extends StoredCoachReview {
  /** `${matchId}:${accountId32}:${model}:${promptVersion}:${locale}` */
  _id: string;
  schemaVersion: number;
}

export const coachReviewId = (k: CoachReviewKey) =>
  `${k.matchId}:${k.accountId32}:${k.model}:${k.promptVersion}:${k.locale}`;

/** AI coach reviews, one per (match, player, model, prompt version, language), kept for good. */
export class CoachReviewsRepository implements CoachReviewsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<CoachReviewDoc>(MATCH_COLLECTIONS.coachReviews);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ userId: 1 }, { name: "by_user" }),
      col.createIndex({ accountId32: 1, matchId: 1 }, { name: "by_account_match" }),
    ]);
  }

  async get(key: CoachReviewKey): Promise<StoredCoachReview | null> {
    const doc = await (await this.col()).findOne({ _id: coachReviewId(key) });
    return doc ? toReview(doc) : null;
  }

  async save(review: StoredCoachReview): Promise<StoredCoachReview> {
    const _id = coachReviewId(review);
    try {
      await (await this.col()).insertOne({ ...review, _id, schemaVersion: SCHEMA_VERSION });
      return review;
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      // Written by another request meanwhile: everyone sees the first one.
      const doc = await (await this.col()).findOne({ _id });
      return doc ? toReview(doc) : review;
    }
  }

  async exportForOwner(owner: DataOwner) {
    const docs = await (
      await this.col()
    )
      .find({ $or: [{ userId: owner.userId }, { accountId32: owner.accountId32 }] })
      .sort({ createdAt: -1 })
      .toArray();
    return forExport(docs as unknown as Record<string, unknown>[]);
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    const res = await (
      await this.col()
    ).deleteMany({ $or: [{ userId: owner.userId }, { accountId32: owner.accountId32 }] });
    return res.deletedCount;
  }
}

function toReview(doc: CoachReviewDoc): StoredCoachReview {
  const { _id: _ignored, schemaVersion: _v, ...rest } = doc;
  return rest;
}

interface CoachUsageSlot {
  /** `${userId}:${hex}`, so a slot can be confirmed or released by its id alone. */
  id: string;
  matchId: string;
  /** `held` while a review is being written; `used` once it was. */
  status: "held" | "used";
  /** When the review was written (or the hold taken). */
  at: Date;
  /** A hold counts until then (a crashed request's hold frees itself). */
  holdUntil: Date;
}

/** One document per user: every slot change is a single-document (atomic) update. */
interface CoachUsageDoc {
  /** The user id. */
  _id: string;
  slots: CoachUsageSlot[];
  /** TTL: removed a day past the quota window after the last change. */
  expiresAt: Date;
  schemaVersion: number;
}

const userOf = (slotId: string) => slotId.slice(0, slotId.lastIndexOf(":"));

/** Free coach reviews written per user, for the rolling-window quota. */
export class CoachUsageRepository implements CoachUsagePort {
  constructor(
    private readonly getDb: () => Promise<Db>,
    private readonly retentionMs = 8 * DAY_MS,
  ) {}

  private async col() {
    return (await this.getDb()).collection<CoachUsageDoc>(MATCH_COLLECTIONS.coachUsage);
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" });
  }

  private async slots(userId: string): Promise<CoachUsageSlot[]> {
    return (await (await this.col()).findOne({ _id: userId }))?.slots ?? [];
  }

  async usesSince(userId: string, since: Date): Promise<Date[]> {
    return (await this.slots(userId))
      .filter((s) => s.status === "used" && s.at > since)
      .map((s) => s.at);
  }

  /**
   * In one atomic update of the user's document: drop slots that no longer count (reviews
   * older than the window, expired holds), then add a hold if fewer than `limit` remain.
   * Concurrent requests are serialised by the database, so only one gets the last slot.
   */
  async reserve(
    userId: string,
    opts: { matchId: string; now: Date; limit: number; windowMs: number; holdMs: number },
  ): Promise<CoachReservation> {
    const { now } = opts;
    const slot: CoachUsageSlot = {
      id: `${userId}:${new ObjectId().toHexString()}`,
      matchId: opts.matchId,
      status: "held",
      at: now,
      holdUntil: new Date(now.getTime() + opts.holdMs),
    };
    const since = new Date(now.getTime() - opts.windowMs);
    const counts = {
      $or: [
        { $and: [{ $eq: ["$$s.status", "used"] }, { $gt: ["$$s.at", since] }] },
        { $and: [{ $eq: ["$$s.status", "held"] }, { $gt: ["$$s.holdUntil", now] }] },
      ],
    };
    const doc = await (
      await this.col()
    ).findOneAndUpdate(
      { _id: userId },
      [
        {
          $set: {
            slots: { $filter: { input: { $ifNull: ["$slots", []] }, as: "s", cond: counts } },
          },
        },
        {
          $set: {
            slots: {
              $cond: [
                { $lt: [{ $size: "$slots" }, opts.limit] },
                { $concatArrays: ["$slots", [{ $literal: slot }]] },
                "$slots",
              ],
            },
            expiresAt: { $literal: new Date(now.getTime() + this.retentionMs) },
            schemaVersion: SCHEMA_VERSION,
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
    return doc?.slots.some((s) => s.id === slot.id) ? { ok: true, id: slot.id } : { ok: false };
  }

  async confirm(id: string, now: Date): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: userOf(id), "slots.id": id },
      {
        $set: {
          "slots.$.status": "used",
          "slots.$.at": now,
          expiresAt: new Date(now.getTime() + this.retentionMs),
        },
      },
    );
  }

  async release(id: string): Promise<void> {
    await (
      await this.col()
    ).updateOne({ _id: userOf(id) }, { $pull: { slots: { id, status: "held" } } });
  }

  async exportForOwner(owner: DataOwner) {
    return (await this.slots(owner.userId))
      .filter((s) => s.status === "used")
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .map((s) => ({ id: s.id, matchId: s.matchId, status: s.status, at: s.at }));
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ _id: owner.userId })).deletedCount;
  }
}

interface ParseRequestDoc {
  /** The match id. No user data: only that someone asked, and when. */
  _id: string;
  requestedAt: Date;
  expiresAt: Date;
}

/** Plus auto parse requests: which recent games to ask for, and a dedupe record. */
export class ParseRequestsRepository implements ParseRequestsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<ParseRequestDoc>(MATCH_COLLECTIONS.parseRequests);
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" });
  }

  async recentUnparsed(accountId32: number, since: Date, limit: number): Promise<string[]> {
    if (limit <= 0) return [];
    const docs = await (
      await this.getDb()
    )
      .collection<PlayerMatchFactDoc>(MATCH_COLLECTIONS.facts)
      // Served by the by_account_parse_status index (match extras).
      .find(
        { accountId32, "provenance.parseStatus": "unparsed", startedAt: { $gte: since } },
        { projection: { _id: 0, matchId: 1 } },
      )
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((d) => d.matchId);
  }

  async claim(matchId: string, now: Date, ttlMs: number): Promise<boolean> {
    const col = await this.col();
    const expiresAt = new Date(now.getTime() + ttlMs);
    try {
      await col.insertOne({ _id: matchId, requestedAt: now, expiresAt });
      return true;
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      // Expired but not yet swept by the TTL monitor (it runs about once a minute).
      const res = await col.updateOne(
        { _id: matchId, expiresAt: { $lte: now } },
        { $set: { requestedAt: now, expiresAt } },
      );
      return res.modifiedCount === 1;
    }
  }

  async release(matchId: string): Promise<void> {
    await (await this.col()).deleteOne({ _id: matchId });
  }
}

interface AutoReviewDoc {
  /** `${userId}:${matchId}` */
  _id: string;
  userId: string;
  matchId: string;
  scheduledAt: Date;
  expiresAt: Date;
}

/** Plus auto post-game reviews: recent ranked games, and which are already scheduled. */
export class AutoReviewsRepository implements AutoReviewsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<AutoReviewDoc>(MATCH_COLLECTIONS.autoReviews);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
      col.createIndex({ userId: 1 }, { name: "by_user" }),
    ]);
  }

  async recentRanked(accountId32: number, since: Date, limit: number): Promise<string[]> {
    if (limit <= 0) return [];
    const docs = await (
      await this.getDb()
    )
      .collection<PlayerMatchFactDoc>(MATCH_COLLECTIONS.facts)
      // Served by the by_account_date index.
      .find(
        { accountId32, ranked: true, startedAt: { $gte: since } },
        { projection: { _id: 0, matchId: 1 } },
      )
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((d) => d.matchId);
  }

  async claim(userId: string, matchId: string, now: Date, ttlMs: number): Promise<boolean> {
    const col = await this.col();
    const _id = `${userId}:${matchId}`;
    const expiresAt = new Date(now.getTime() + ttlMs);
    try {
      await col.insertOne({ _id, userId, matchId, scheduledAt: now, expiresAt });
      return true;
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      // Expired but not yet swept by the TTL monitor.
      const res = await col.updateOne(
        { _id, expiresAt: { $lte: now } },
        { $set: { scheduledAt: now, expiresAt } },
      );
      return res.modifiedCount === 1;
    }
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
