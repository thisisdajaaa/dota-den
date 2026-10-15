import "server-only";
import type { Db } from "mongodb";
import type { DownState } from "../domain/alert-rules";
import { ALERTS_COLLECTIONS, type AlertStateDocument } from "../alerts.model";
import type { AlertStatePort } from "../alerts.ports";

/** A handful of documents (one per watched upstream); no indexes needed. */
export class AlertStateRepository implements AlertStatePort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<AlertStateDocument>(ALERTS_COLLECTIONS.state);
  }

  async get(name: string): Promise<DownState | null> {
    const doc = await (await this.col()).findOne({ _id: name });
    return doc ? { downSince: doc.downSince, lastDownAt: doc.lastDownAt } : null;
  }

  async set(name: string, state: DownState | null): Promise<void> {
    const col = await this.col();
    if (state === null) await col.deleteOne({ _id: name });
    else await col.updateOne({ _id: name }, { $set: state }, { upsert: true });
  }
}
