import type { Collection, Db, Filter } from "mongodb";
import type { DraftHistoryRepository, HistoryOpponent } from "../application/draft-history-ports";
import type { DraftHistoryRecord, ReportedResult } from "../domain/draft-history";

const SCHEMA_VERSION = 1;

/** Permanent: no TTL, unlike draft_rooms. */
export const DRAFT_HISTORY_COLLECTION = "draft_history";

interface HistoryDoc extends DraftHistoryRecord {
  /** The room id again, so uniqueness holds even before `ensureDraftHistoryIndexes` runs. */
  _id: string;
  schemaVersion: number;
  /** Both captains, for "my drafts" queries. */
  captainUserIds: string[];
  /** Both captains' account ids, for filtering by friend. */
  captainAccountIds: number[];
}

export async function ensureDraftHistoryIndexes(db: Db): Promise<void> {
  const history = db.collection(DRAFT_HISTORY_COLLECTION);
  // One multikey array per index (MongoDB can't index two arrays together), so the friend
  // filter narrows the per-captain index scan.
  await Promise.all([
    history.createIndex({ roomId: 1 }, { unique: true, name: "uniq_roomId" }),
    history.createIndex({ captainUserIds: 1, completedAt: -1 }, { name: "by_captain_completedAt" }),
  ]);
}

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === 11000;
}

function toRecord(doc: HistoryDoc): DraftHistoryRecord {
  const { _id: _i, schemaVersion: _v, captainUserIds: _u, captainAccountIds: _a, ...record } = doc;
  return record;
}

export class MongoDraftHistoryRepository implements DraftHistoryRepository {
  private readonly history: Collection<HistoryDoc>;

  constructor(db: Db) {
    this.history = db.collection<HistoryDoc>(DRAFT_HISTORY_COLLECTION);
  }

  async insertOnce(record: DraftHistoryRecord): Promise<"inserted" | "duplicate"> {
    const doc: HistoryDoc = {
      _id: record.roomId,
      ...record,
      schemaVersion: SCHEMA_VERSION,
      captainUserIds: [record.captains.radiant.userId, record.captains.dire.userId],
      captainAccountIds: [record.captains.radiant.accountId32, record.captains.dire.accountId32],
    };
    try {
      // $setOnInsert never overwrites an existing record (or its reported result).
      const res = await this.history.updateOne(
        { roomId: record.roomId },
        { $setOnInsert: doc },
        { upsert: true },
      );
      return res.upsertedCount === 1 ? "inserted" : "duplicate";
    } catch (e) {
      // Two concurrent upserts: the unique index lets exactly one insert win.
      if (isDuplicateKey(e)) return "duplicate";
      throw e;
    }
  }

  async get(roomId: string): Promise<DraftHistoryRecord | null> {
    const doc = await this.history.findOne({ roomId });
    return doc ? toRecord(doc) : null;
  }

  async setResult(roomId: string, captainUserId: string, result: ReportedResult): Promise<boolean> {
    const res = await this.history.updateOne(
      { roomId, captainUserIds: captainUserId },
      { $set: { result } },
    );
    return res.matchedCount === 1;
  }

  async listForCaptain(
    userId: string,
    opts: { friendAccountId: number | null; skip: number; limit: number },
  ): Promise<{ items: DraftHistoryRecord[]; total: number }> {
    const filter: Filter<HistoryDoc> = { captainUserIds: userId };
    if (opts.friendAccountId !== null) filter.captainAccountIds = opts.friendAccountId;
    const [docs, total] = await Promise.all([
      this.history
        .find(filter)
        .sort({ completedAt: -1, roomId: 1 })
        .skip(opts.skip)
        .limit(opts.limit)
        .toArray(),
      this.history.countDocuments(filter),
    ]);
    return { items: docs.map(toRecord), total };
  }

  async opponents(userId: string, limit: number): Promise<HistoryOpponent[]> {
    const rows = await this.history
      .aggregate<HistoryOpponent>([
        { $match: { captainUserIds: userId } },
        { $sort: { completedAt: -1 } },
        {
          $project: {
            completedAt: 1,
            opponent: {
              $cond: [
                { $eq: ["$captains.radiant.userId", userId] },
                "$captains.dire",
                "$captains.radiant",
              ],
            },
          },
        },
        {
          $group: {
            _id: "$opponent.accountId32",
            name: { $first: "$opponent.name" },
            avatarUrl: { $first: "$opponent.avatarUrl" },
            last: { $first: "$completedAt" },
            drafts: { $sum: 1 },
          },
        },
        { $sort: { last: -1 } },
        { $limit: limit },
        { $project: { _id: 0, accountId32: "$_id", name: 1, avatarUrl: 1, drafts: 1 } },
      ])
      .toArray();
    return rows;
  }
}
