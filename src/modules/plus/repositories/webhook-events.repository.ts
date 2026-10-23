import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import {
  PLUS_COLLECTIONS,
  PLUS_SCHEMA_VERSION,
  type WebhookEventDocument,
  type WebhookEventOutcome,
} from "../plus.model";
import type { WebhookEventsPort } from "../plus.ports";

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

  async claim(event: Parameters<WebhookEventsPort["claim"]>[0]): Promise<boolean> {
    try {
      await (
        await this.col()
      ).insertOne({
        _id: event.id,
        provider: event.provider,
        eventName: event.eventName,
        subscriptionId: event.subscriptionId,
        userId: event.userId,
        outcome: "processing",
        receivedAt: event.receivedAt,
        schemaVersion: PLUS_SCHEMA_VERSION,
      });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
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
