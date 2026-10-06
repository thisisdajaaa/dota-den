import "server-only";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { ObjectId, type Db } from "mongodb";
import type { MmrEntry } from "../domain/mmr-entry";
import {
  MMR_COLLECTIONS,
  MMR_SCHEMA_VERSION as SCHEMA_VERSION,
  type MmrEntryDoc,
} from "../mmr.model";
import type { MmrEntriesPort } from "../mmr.ports";

function toEntry({ _id, schemaVersion: _v, ...rest }: MmrEntryDoc): MmrEntry {
  return { id: _id.toHexString(), ...rest };
}

export class MmrEntriesRepository implements MmrEntriesPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<MmrEntryDoc>(MMR_COLLECTIONS.entries);
  }

  async create(entry: Omit<MmrEntry, "id">): Promise<MmrEntry> {
    const doc: MmrEntryDoc = { _id: new ObjectId(), schemaVersion: SCHEMA_VERSION, ...entry };
    await (await this.col()).insertOne(doc);
    return toEntry(doc);
  }

  async findOwned(id: string, userId: string): Promise<MmrEntry | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await (await this.col()).findOne({ _id: new ObjectId(id), userId });
    return doc ? toEntry(doc) : null;
  }

  async updateOwned(
    id: string,
    userId: string,
    patch: Pick<MmrEntry, "mmr" | "observedAt" | "note" | "updatedAt">,
  ): Promise<MmrEntry | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await (
      await this.col()
    ).findOneAndUpdate(
      { _id: new ObjectId(id), userId },
      { $set: patch },
      { returnDocument: "after" },
    );
    return doc ? toEntry(doc) : null;
  }

  async deleteOwned(id: string, userId: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const res = await (await this.col()).deleteOne({ _id: new ObjectId(id), userId });
    return res.deletedCount === 1;
  }

  async list(
    userId: string,
    accountId32: number,
    range: { from?: Date; to?: Date } = {},
  ): Promise<MmrEntry[]> {
    const observedAt: Record<string, Date> = {};
    if (range.from) observedAt.$gte = range.from;
    if (range.to) observedAt.$lte = range.to;
    const docs = await (
      await this.col()
    )
      .find({ userId, accountId32, ...(range.from || range.to ? { observedAt } : {}) })
      .sort({ observedAt: 1 })
      .limit(5_000)
      .toArray();
    return docs.map(toEntry);
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ userId: 1, accountId32: 1, observedAt: 1 }, { name: "by_owner_account_time" });
  }

  /** Admin overview: MMR entries per user. */
  async countsByUser(userIds: readonly string[]): Promise<Map<string, number>> {
    const rows = await (
      await this.col()
    )
      .aggregate<{ _id: string; n: number }>([
        { $match: { userId: { $in: [...userIds] } } },
        { $group: { _id: "$userId", n: { $sum: 1 } } },
      ])
      .toArray();
    return new Map(rows.map((r) => [String(r._id), r.n]));
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(
      await (await this.col()).find({ userId: owner.userId }).sort({ observedAt: 1 }).toArray(),
    );
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
