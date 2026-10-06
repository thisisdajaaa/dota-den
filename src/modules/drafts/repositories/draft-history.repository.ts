import "server-only";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { Db, Filter } from "mongodb";
import type { CaptainTotals, DraftHistoryPort, HistoryOpponent } from "../draft-history.ports";
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

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === 11000;
}

function toRecord(doc: HistoryDoc): DraftHistoryRecord {
  const { _id: _i, schemaVersion: _v, captainUserIds: _u, captainAccountIds: _a, ...record } = doc;
  return record;
}

export class DraftHistoryRepository implements DraftHistoryPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async history() {
    return (await this.getDb()).collection<HistoryDoc>(DRAFT_HISTORY_COLLECTION);
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
      const res = await (
        await this.history()
      ).updateOne({ roomId: record.roomId }, { $setOnInsert: doc }, { upsert: true });
      return res.upsertedCount === 1 ? "inserted" : "duplicate";
    } catch (e) {
      // Two concurrent upserts: the unique index lets exactly one insert win.
      if (isDuplicateKey(e)) return "duplicate";
      throw e;
    }
  }

  async get(roomId: string): Promise<DraftHistoryRecord | null> {
    const doc = await (await this.history()).findOne({ roomId });
    return doc ? toRecord(doc) : null;
  }

  async setResult(roomId: string, captainUserId: string, result: ReportedResult): Promise<boolean> {
    const res = await (
      await this.history()
    ).updateOne({ roomId, captainUserIds: captainUserId }, { $set: { result } });
    return res.matchedCount === 1;
  }

  async listForCaptain(
    userId: string,
    opts: { friendAccountId: number | null; skip: number; limit: number },
  ): Promise<{ items: DraftHistoryRecord[]; total: number }> {
    const filter: Filter<HistoryDoc> = { captainUserIds: userId };
    if (opts.friendAccountId !== null) filter.captainAccountIds = opts.friendAccountId;
    const [docs, total] = await Promise.all([
      (await this.history())
        .find(filter)
        .sort({ completedAt: -1, roomId: 1 })
        .skip(opts.skip)
        .limit(opts.limit)
        .toArray(),
      (await this.history()).countDocuments(filter),
    ]);
    return { items: docs.map(toRecord), total };
  }

  async opponents(userId: string, limit: number): Promise<HistoryOpponent[]> {
    const rows = await (
      await this.history()
    )
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

  async captainTotals(query: {
    since: Date | null;
    userIds: readonly string[] | null;
  }): Promise<CaptainTotals[]> {
    const match: Filter<HistoryDoc> = {};
    if (query.since) match.completedAt = { $gte: query.since };
    if (query.userIds) match.captainUserIds = { $in: [...query.userIds] };
    const seat = (side: "radiant" | "dire") => ({ userId: `$captains.${side}.userId`, side });
    const rows = await (
      await this.history()
    )
      .aggregate<CaptainTotals>([
        { $match: match },
        // One row per captain: the draft from each side.
        { $project: { result: 1, seat: [seat("radiant"), seat("dire")] } },
        { $unwind: "$seat" },
        ...(query.userIds ? [{ $match: { "seat.userId": { $in: [...query.userIds] } } }] : []),
        {
          $group: {
            _id: "$seat.userId",
            drafts: { $sum: 1 },
            wins: { $sum: { $cond: [{ $eq: ["$result.winner", "$seat.side"] }, 1, 0] } },
            losses: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ["$result.winner", ["radiant", "dire"]] },
                      { $ne: ["$result.winner", "$seat.side"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $project: { _id: 0, userId: "$_id", drafts: 1, wins: 1, losses: 1 } },
      ])
      .toArray();
    return rows;
  }

  async ensureIndexes(): Promise<void> {
    const db = await this.getDb();
    const history = db.collection(DRAFT_HISTORY_COLLECTION);
    // One multikey array per index (MongoDB can't index two arrays together), so the friend
    // filter narrows the per-captain index scan.
    await Promise.all([
      history.createIndex({ roomId: 1 }, { unique: true, name: "uniq_roomId" }),
      history.createIndex(
        { captainUserIds: 1, completedAt: -1 },
        { name: "by_captain_completedAt" },
      ),
      // Weekly leaderboards across everyone.
      history.createIndex({ completedAt: -1 }, { name: "by_completedAt" }),
    ]);
  }

  /** Admin overview: finished room drafts per captain. */
  async countsByUser(userIds: readonly string[]): Promise<Map<string, number>> {
    const db = await this.getDb();
    const rows = await db
      .collection(DRAFT_HISTORY_COLLECTION)
      .aggregate<{ _id: string; n: number }>([
        { $match: { captainUserIds: { $in: [...userIds] } } },
        { $unwind: "$captainUserIds" },
        { $match: { captainUserIds: { $in: [...userIds] } } },
        { $group: { _id: "$captainUserIds", n: { $sum: 1 } } },
      ])
      .toArray();
    return new Map(rows.map((r) => [String(r._id), r.n]));
  }

  /** Friend-room drafts you captained, for "Download your data". */
  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.history()).find({ captainUserIds: owner.userId }).toArray());
  }

  /**
   * Friend-room drafts are shared with the other captain, so they stay in their history: only
   * this player's name, picture and ids are removed.
   */
  async anonymiseOwner(owner: DataOwner): Promise<number> {
    const col = await this.history();
    let anonymised = 0;
    for (const side of ["radiant", "dire"] as const) {
      const r = await col.updateMany({ [`captains.${side}.userId`]: owner.userId }, {
        $set: {
          [`captains.${side}.userId`]: "deleted",
          [`captains.${side}.accountId32`]: 0,
          [`captains.${side}.name`]: "Deleted player",
          [`captains.${side}.avatarUrl`]: null,
        },
        $pull: { captainUserIds: owner.userId, captainAccountIds: owner.accountId32 },
      } as never);
      anonymised += r.modifiedCount;
    }
    return anonymised;
  }
}
