import "server-only";
import type { Db } from "mongodb";
import { ALERTS_COLLECTIONS, type AlertThrottleDocument } from "../alerts.model";
import type { AlertThrottlePort } from "../alerts.ports";

const isDuplicateKey = (error: unknown) => (error as { code?: number }).code === 11000;

export class AlertThrottleRepository implements AlertThrottlePort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<AlertThrottleDocument>(ALERTS_COLLECTIONS.throttle);
  }

  async ensureIndexes(): Promise<void> {
    // Each key's document disappears when its window ends.
    await (
      await this.col()
    ).createIndex({ until: 1 }, { expireAfterSeconds: 0, name: "ttl_until" });
  }

  /**
   * Inserting the key is the claim. A duplicate key means it's throttled, unless its window
   * has already ended (the TTL monitor runs about once a minute): then take it over, atomically.
   */
  async claim(key: string, until: Date, now: Date): Promise<boolean> {
    const col = await this.col();
    try {
      await col.insertOne({ _id: key, until });
      return true;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    const expired = await col.updateOne({ _id: key, until: { $lte: now } }, { $set: { until } });
    return expired.modifiedCount === 1;
  }
}
