import "server-only";
import type { Db } from "mongodb";
import type { DataOwner } from "@/common/privacy/user-data";
import {
  IDENTITY_COLLECTIONS,
  IDENTITY_SCHEMA_VERSION,
  type SessionDocument,
} from "../identity.model";
import type { SessionRecord, SessionRepository } from "../identity.ports";

export class SessionsRepository implements SessionRepository {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<SessionDocument>(IDENTITY_COLLECTIONS.sessions);
  }

  async create(record: SessionRecord): Promise<void> {
    await (await this.col()).insertOne({ ...record, schemaVersion: IDENTITY_SCHEMA_VERSION });
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const doc = await (
      await this.col()
    ).findOne({ tokenHash }, { projection: { _id: 0, schemaVersion: 0 } });
    return doc;
  }

  async replace(oldTokenHash: string, next: SessionRecord): Promise<boolean> {
    const res = await (await this.col()).updateOne({ tokenHash: oldTokenHash }, { $set: next });
    return res.modifiedCount === 1;
  }

  async delete(tokenHash: string): Promise<void> {
    await (await this.col()).deleteOne({ tokenHash });
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ tokenHash: 1 }, { unique: true, name: "uniq_tokenHash" }),
      col.createIndex({ userId: 1 }, { name: "by_user" }),
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
    ]);
  }

  /** Every sign-in session of a user (signs them out everywhere). */
  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
