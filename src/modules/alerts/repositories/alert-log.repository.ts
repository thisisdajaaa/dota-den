import "server-only";
import { ObjectId, type Db } from "mongodb";
import {
  ALERT_LOG_RETENTION_S,
  ALERTS_COLLECTIONS,
  type OwnerAlert,
  type OwnerAlertDocument,
} from "../alerts.model";
import type { AlertLogPort } from "../alerts.ports";

export class AlertLogRepository implements AlertLogPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<OwnerAlertDocument>(ALERTS_COLLECTIONS.log);
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ at: 1 }, { expireAfterSeconds: ALERT_LOG_RETENTION_S, name: "ttl_30d" });
  }

  async insert(alert: Omit<OwnerAlert, "id">): Promise<void> {
    await (await this.col()).insertOne({ _id: new ObjectId(), ...alert });
  }

  async recent(limit: number): Promise<OwnerAlert[]> {
    const docs = await (await this.col()).find({}).sort({ at: -1 }).limit(limit).toArray();
    return docs.map(({ _id, ...rest }) => ({ id: _id.toHexString(), ...rest }));
  }
}
