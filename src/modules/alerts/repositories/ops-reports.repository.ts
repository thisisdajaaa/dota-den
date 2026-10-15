import "server-only";
import { ObjectId, type Db } from "mongodb";
import {
  ALERTS_COLLECTIONS,
  OPS_REPORT_RETENTION_S,
  type OpsReport,
  type OpsReportDocument,
} from "../alerts.model";
import type { OpsReportsPort } from "../alerts.ports";

export class OpsReportsRepository implements OpsReportsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<OpsReportDocument>(ALERTS_COLLECTIONS.opsReports);
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ at: 1 }, { expireAfterSeconds: OPS_REPORT_RETENTION_S, name: "ttl_90d" });
  }

  async insert(report: Omit<OpsReport, "id">): Promise<void> {
    await (await this.col()).insertOne({ _id: new ObjectId(), ...report });
  }

  async recent(limit: number): Promise<OpsReport[]> {
    const docs = await (await this.col()).find({}).sort({ at: -1 }).limit(limit).toArray();
    return docs.map(({ _id, ...rest }) => ({ id: _id.toHexString(), ...rest }));
  }
}
