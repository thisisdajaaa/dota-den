import type { AnyBulkWriteOperation, Collection, Db } from "mongodb";
import type { AccountPair, PairClassification } from "../domain/pair";
import type { Relation, Seat } from "../domain/relation";
import type { TogetherRepository } from "../application/ports";

const SCHEMA_VERSION = 1;

export const TOGETHER_COLLECTIONS = { matches: "together_matches" } as const;

interface TogetherMatchDoc {
  matchId: string;
  /** Always the smaller account id of the pair. */
  accountIdA: number;
  accountIdB: number;
  relation: Relation;
  startedAt: Date;
  radiantWin: boolean | null;
  seatA: Seat | null;
  seatB: Seat | null;
  fetchedAt: Date;
  schemaVersion: number;
}

export async function ensureTogetherIndexes(db: Db): Promise<void> {
  const col = db.collection(TOGETHER_COLLECTIONS.matches);
  await Promise.all([
    col.createIndex(
      { matchId: 1, accountIdA: 1, accountIdB: 1 },
      { unique: true, name: "uniq_match_pair" },
    ),
    // Party lookups for one account, whichever side of the pair it is stored on.
    col.createIndex({ accountIdA: 1, relation: 1 }, { name: "by_a_relation" }),
    col.createIndex({ accountIdB: 1, relation: 1 }, { name: "by_b_relation" }),
  ]);
}

function toDomain(d: TogetherMatchDoc): PairClassification {
  return {
    matchId: d.matchId,
    accountIdA: d.accountIdA,
    accountIdB: d.accountIdB,
    relation: d.relation,
    startedAt: d.startedAt,
    radiantWin: d.radiantWin,
    seatA: d.seatA,
    seatB: d.seatB,
    fetchedAt: d.fetchedAt,
  };
}

export class MongoTogetherRepository implements TogetherRepository {
  private readonly col: Collection<TogetherMatchDoc>;

  constructor(db: Db) {
    this.col = db.collection<TogetherMatchDoc>(TOGETHER_COLLECTIONS.matches);
  }

  async find(pair: AccountPair, matchIds: readonly string[]): Promise<PairClassification[]> {
    if (matchIds.length === 0) return [];
    const docs = await this.col
      .find({
        accountIdA: pair.accountIdA,
        accountIdB: pair.accountIdB,
        matchId: { $in: [...matchIds] },
      })
      .toArray();
    return docs.map(toDomain);
  }

  async saveMany(rows: readonly PairClassification[]): Promise<void> {
    if (rows.length === 0) return;
    const ops: AnyBulkWriteOperation<TogetherMatchDoc>[] = rows.map((r) => {
      if (r.accountIdA >= r.accountIdB) throw new Error("pair must be stored in ascending order");
      return {
        updateOne: {
          filter: { matchId: r.matchId, accountIdA: r.accountIdA, accountIdB: r.accountIdB },
          update: { $set: { ...r, schemaVersion: SCHEMA_VERSION } },
          upsert: true,
        },
      };
    });
    try {
      await this.col.bulkWrite(ops, { ordered: false });
    } catch (e) {
      // Two requests racing on the same new match: the unique index keeps one; that's fine.
      if (!(e && typeof e === "object" && "code" in e && e.code === 11000)) throw e;
    }
  }

  async unknownPartyMatchIdsOf(accountId32: number): Promise<string[]> {
    const ids = await this.col.distinct("matchId", {
      relation: "same_team_unknown",
      $or: [{ accountIdA: accountId32 }, { accountIdB: accountId32 }],
    });
    return ids.map(String);
  }

  async partyMatchesOf(accountId32: number): Promise<PairClassification[]> {
    const docs = await this.col
      .find({
        relation: "party",
        $or: [{ accountIdA: accountId32 }, { accountIdB: accountId32 }],
      })
      .sort({ startedAt: -1 })
      .limit(5_000)
      .toArray();
    return docs.map(toDomain);
  }
}
