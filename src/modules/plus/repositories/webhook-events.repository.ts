import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import {
  PLUS_COLLECTIONS,
  PLUS_SCHEMA_VERSION,
  type WebhookEventDocument,
  type WebhookEventOutcome,
} from "../plus.model";
import type { WebhookClaim, WebhookEventsPort } from "../plus.ports";

/**
 * Kept 90 days: long past any provider retry, so a replay inside that window is a no-op, and a
 * replay after it is still harmless (out-of-order protection rejects old subscription states).
 */
const EVENT_TTL_SECONDS = 90 * 24 * 3600;

/** Received billing webhooks (routing facts only); inserting the id is the claim. */
export class WebhookEventsRepository implements WebhookEventsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<WebhookEventDocument>(PLUS_COLLECTIONS.webhookEvents);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex(
      { receivedAt: 1 },
      { name: "ttl", expireAfterSeconds: EVENT_TTL_SECONDS },
    );
    await col.createIndex({ userId: 1 }, { name: "by_user", sparse: true });
  }

  async claim(
    event: Parameters<WebhookEventsPort["claim"]>[0],
    staleMs: number,
  ): Promise<WebhookClaim> {
    const col = await this.col();
    try {
      await col.insertOne({
        _id: event.id,
        provider: event.provider,
        eventName: event.eventName,
        subscriptionId: event.subscriptionId,
        userId: event.userId,
        outcome: "processing",
        receivedAt: event.receivedAt,
        claimedAt: event.receivedAt,
        schemaVersion: PLUS_SCHEMA_VERSION,
      });
      return "claimed";
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    // Already received: take it over if its handler died (claimed long ago, never finished).
    const before = new Date(event.receivedAt.getTime() - staleMs);
    const taken = await col.findOneAndUpdate(
      {
        _id: event.id,
        outcome: "processing",
        $or: [
          { claimedAt: { $lt: before } },
          { claimedAt: { $exists: false }, receivedAt: { $lt: before } },
        ],
      },
      { $set: { claimedAt: event.receivedAt } },
    );
    if (taken) return "claimed";
    const current = await col.findOne({ _id: event.id }, { projection: { outcome: 1 } });
    // Released meanwhile (its handler failed): this delivery can't know, so retry later.
    if (!current) return "in_progress";
    return current.outcome === "processing" ? "in_progress" : "duplicate";
  }

  async finish(id: string, outcome: WebhookEventOutcome, userId?: string | null): Promise<void> {
    await (
      await this.col()
    ).updateOne({ _id: id }, { $set: { outcome, ...(userId === undefined ? {} : { userId }) } });
  }

  async release(id: string): Promise<void> {
    await (await this.col()).deleteOne({ _id: id });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
