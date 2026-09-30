import { ObjectId, type Collection, type Db } from "mongodb";
import type { MmrEntry } from "../domain/mmr-entry";
import type { MmrEntryRepository } from "../application/ports";

const SCHEMA_VERSION = 1;
export const MMR_COLLECTIONS = { entries: "mmr_entries" } as const;

interface MmrEntryDoc extends Omit<MmrEntry, "id"> {
  _id: ObjectId;
  schemaVersion: number;
}

export async function ensureMmrIndexes(db: Db): Promise<void> {
  await db
    .collection(MMR_COLLECTIONS.entries)
    .createIndex({ userId: 1, accountId32: 1, observedAt: 1 }, { name: "by_owner_account_time" });
}

function toEntry({ _id, schemaVersion: _v, ...rest }: MmrEntryDoc): MmrEntry {
  return { id: _id.toHexString(), ...rest };
}

export class MongoMmrEntryRepository implements MmrEntryRepository {
  private readonly col: Collection<MmrEntryDoc>;

  constructor(db: Db) {
    this.col = db.collection<MmrEntryDoc>(MMR_COLLECTIONS.entries);
  }

  async create(entry: Omit<MmrEntry, "id">): Promise<MmrEntry> {
    const doc: MmrEntryDoc = { _id: new ObjectId(), schemaVersion: SCHEMA_VERSION, ...entry };
    await this.col.insertOne(doc);
    return toEntry(doc);
  }

  async findOwned(id: string, userId: string): Promise<MmrEntry | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await this.col.findOne({ _id: new ObjectId(id), userId });
    return doc ? toEntry(doc) : null;
  }

  async updateOwned(
    id: string,
    userId: string,
    patch: Pick<MmrEntry, "mmr" | "observedAt" | "note" | "updatedAt">,
  ): Promise<MmrEntry | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await this.col.findOneAndUpdate(
      { _id: new ObjectId(id), userId },
      { $set: patch },
      { returnDocument: "after" },
    );
    return doc ? toEntry(doc) : null;
  }

  async deleteOwned(id: string, userId: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const res = await this.col.deleteOne({ _id: new ObjectId(id), userId });
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
    const docs = await this.col
      .find({ userId, accountId32, ...(range.from || range.to ? { observedAt } : {}) })
      .sort({ observedAt: 1 })
      .limit(5_000)
      .toArray();
    return docs.map(toEntry);
  }
}

/** Admin overview: MMR entries per user. */
export async function mmrEntryCountsByUser(
  db: Db,
  userIds: readonly string[],
): Promise<Map<string, number>> {
  const rows = await db
    .collection(MMR_COLLECTIONS.entries)
    .aggregate<{ _id: string; n: number }>([
      { $match: { userId: { $in: [...userIds] } } },
      { $group: { _id: "$userId", n: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [String(r._id), r.n]));
}
