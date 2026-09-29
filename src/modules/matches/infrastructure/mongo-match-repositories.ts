import type { AnyBulkWriteOperation, Collection, Db } from "mongodb";
import type { PlayerMatchFact } from "../domain/player-match-fact";
import type { QueueClass } from "../domain/queue-classification";
import type {
  DashboardFact,
  DashboardFacts,
  DashboardFilter,
  ImportStatus,
  LockOutcome,
  MatchQueries,
  PlayerMatchFactRepository,
  SyncState,
  SyncStateRepository,
} from "../application/ports";

const SCHEMA_VERSION = 1;

export const MATCH_COLLECTIONS = {
  matches: "matches",
  facts: "player_match_facts",
  syncState: "match_sync_state",
} as const;

export interface PlayerMatchFactDoc extends PlayerMatchFact {
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MatchDoc {
  matchId: string;
  startedAt: Date;
  durationSec: number;
  gameMode: number | null;
  lobbyType: number | null;
  patch: PlayerMatchFact["patch"];
  provider: "opendota";
  fetchedAt: Date;
  schemaVersion: number;
}

interface SyncStateDoc extends SyncState {
  lockedUntil: Date | null;
}

export async function ensureMatchIndexes(db: Db): Promise<void> {
  const facts = db.collection(MATCH_COLLECTIONS.facts);
  const matches = db.collection(MATCH_COLLECTIONS.matches);
  await Promise.all([
    facts.createIndex({ accountId32: 1, matchId: 1 }, { unique: true, name: "uniq_account_match" }),
    facts.createIndex({ accountId32: 1, startedAt: -1 }, { name: "by_account_date" }),
    facts.createIndex(
      { accountId32: 1, "patch.patch": 1, startedAt: -1 },
      { name: "by_account_patch" },
    ),
    facts.createIndex(
      { accountId32: 1, "queue.queueClass": 1, startedAt: -1 },
      { name: "by_account_queue" },
    ),
    matches.createIndex({ matchId: 1 }, { unique: true, name: "uniq_matchId" }),
    matches.createIndex({ startedAt: -1 }, { name: "by_date" }),
    db
      .collection(MATCH_COLLECTIONS.syncState)
      .createIndex({ accountId32: 1 }, { unique: true, name: "uniq_accountId32" }),
  ]);
}

export class MongoPlayerMatchFactRepository implements PlayerMatchFactRepository {
  private readonly facts: Collection<PlayerMatchFactDoc>;
  private readonly matches: Collection<MatchDoc>;

  constructor(db: Db) {
    this.facts = db.collection<PlayerMatchFactDoc>(MATCH_COLLECTIONS.facts);
    this.matches = db.collection<MatchDoc>(MATCH_COLLECTIONS.matches);
  }

  async upsertMany(
    facts: readonly PlayerMatchFact[],
  ): Promise<{ inserted: number; updated: number }> {
    if (facts.length === 0) return { inserted: 0, updated: 0 };
    const now = new Date();

    const factOps: AnyBulkWriteOperation<PlayerMatchFactDoc>[] = facts.map((f) => ({
      updateOne: {
        filter: { accountId32: f.accountId32, matchId: f.matchId },
        update: {
          $set: { ...f, schemaVersion: SCHEMA_VERSION, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    }));
    const matchOps: AnyBulkWriteOperation<MatchDoc>[] = facts.map((f) => ({
      updateOne: {
        filter: { matchId: f.matchId },
        update: {
          $set: {
            startedAt: f.startedAt,
            durationSec: f.durationSec,
            gameMode: f.gameMode,
            lobbyType: f.lobbyType,
            patch: f.patch,
            provider: f.provenance.provider,
            fetchedAt: f.provenance.fetchedAt,
            schemaVersion: SCHEMA_VERSION,
          },
        },
        upsert: true,
      },
    }));

    const [factRes] = await Promise.all([
      this.facts.bulkWrite(factOps, { ordered: false }),
      this.matches.bulkWrite(matchOps, { ordered: false }),
    ]);
    return { inserted: factRes.upsertedCount, updated: factRes.matchedCount };
  }
}

export class MongoSyncStateRepository implements SyncStateRepository {
  private readonly col: Collection<SyncStateDoc>;

  constructor(db: Db) {
    this.col = db.collection<SyncStateDoc>(MATCH_COLLECTIONS.syncState);
  }

  async acquire(
    accountId32: number,
    {
      now,
      lockTtlMs,
      cooldownMs,
      backfillCooldownMs,
    }: { now: Date; lockTtlMs: number; cooldownMs: number; backfillCooldownMs: number },
  ): Promise<LockOutcome> {
    const before = (ms: number) => new Date(now.getTime() - ms);
    try {
      const doc = await this.col.findOneAndUpdate(
        {
          accountId32,
          $and: [
            { $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
            {
              $or: [
                { lastSyncAt: null },
                { backfillComplete: true, lastSyncAt: { $lte: before(cooldownMs) } },
                {
                  backfillComplete: { $ne: true },
                  lastSyncAt: { $lte: before(backfillCooldownMs) },
                },
              ],
            },
          ],
        },
        {
          $set: { lockedUntil: new Date(now.getTime() + lockTtlMs) },
          $setOnInsert: {
            lastSyncAt: null,
            newestStartedAt: null,
            backfillOffset: 0,
            backfillComplete: false,
          },
        },
        { upsert: true, returnDocument: "after" },
      );
      if (!doc) throw new Error("sync state upsert returned no document");
      return { type: "acquired", state: toState(doc) };
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      // The document exists but didn't match: it's either locked or cooling down.
      const existing = await this.col.findOne({ accountId32 });
      if (existing?.lockedUntil && existing.lockedUntil > now) return { type: "locked" };
      if (existing?.lastSyncAt) {
        const wait = existing.backfillComplete ? cooldownMs : backfillCooldownMs;
        return { type: "cooldown", retryAt: new Date(existing.lastSyncAt.getTime() + wait) };
      }
      return { type: "locked" };
    }
  }

  async release(accountId32: number, next: Omit<SyncState, "accountId32">): Promise<void> {
    await this.col.updateOne({ accountId32 }, { $set: { ...next, lockedUntil: null } });
  }

  async abandon(accountId32: number): Promise<void> {
    await this.col.updateOne({ accountId32 }, { $set: { lockedUntil: null } });
  }

  async get(accountId32: number): Promise<SyncState | null> {
    const doc = await this.col.findOne({ accountId32 });
    return doc ? toState(doc) : null;
  }
}

function toState(doc: SyncStateDoc): SyncState {
  return {
    accountId32: doc.accountId32,
    lastSyncAt: doc.lastSyncAt,
    newestStartedAt: doc.newestStartedAt,
    backfillOffset: doc.backfillOffset,
    backfillComplete: doc.backfillComplete,
  };
}

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === 11000;
}

export class MongoMatchQueries implements MatchQueries {
  constructor(private readonly db: Db) {}

  async importStatus(accountId32: number): Promise<ImportStatus> {
    const [sync, counts] = await Promise.all([
      new MongoSyncStateRepository(this.db).get(accountId32),
      this.db
        .collection<PlayerMatchFactDoc>(MATCH_COLLECTIONS.facts)
        .aggregate<{ _id: QueueClass; n: number }>([
          { $match: { accountId32 } },
          { $group: { _id: "$queue.queueClass", n: { $sum: 1 } } },
        ])
        .toArray(),
    ]);
    const totals = { all: 0, solo: 0, party: 0, unknown: 0 };
    for (const c of counts) {
      totals[c._id] = c.n;
      totals.all += c.n;
    }
    return { sync, totals };
  }

  async dashboardFacts(
    accountId32: number,
    filter: DashboardFilter,
    now: Date,
  ): Promise<DashboardFacts> {
    const col = this.db.collection<PlayerMatchFactDoc>(MATCH_COLLECTIONS.facts);
    const latest = await col.findOne(
      { accountId32 },
      { sort: { startedAt: -1 }, projection: { "patch.patch": 1 } },
    );
    const latestPatch = latest?.patch.patch ?? null;

    const query: Record<string, unknown> = { accountId32 };
    if (filter.mode === "ranked") query.ranked = true;
    if (filter.range === "30d")
      query.startedAt = { $gte: new Date(now.getTime() - 30 * 86_400_000) };
    if (filter.range === "patch") query["patch.patch"] = latestPatch;

    const docs = await col
      .find(query, {
        sort: { startedAt: -1 },
        limit: 5_000,
        projection: {
          _id: 0,
          matchId: 1,
          startedAt: 1,
          durationSec: 1,
          heroId: 1,
          side: 1,
          result: 1,
          kills: 1,
          deaths: 1,
          assists: 1,
          ranked: 1,
          queue: 1,
          patch: 1,
        },
      })
      .toArray();

    const facts: DashboardFact[] = docs.map((d) => ({
      matchId: d.matchId,
      startedAt: d.startedAt,
      durationSec: d.durationSec,
      heroId: d.heroId,
      side: d.side,
      result: d.result,
      kills: d.kills,
      deaths: d.deaths,
      assists: d.assists,
      ranked: d.ranked,
      queueClass: d.queue.queueClass,
      partySize: d.queue.partySize,
      patch: d.patch.patch,
      patchCertainty: d.patch.certainty,
    }));
    return { facts, latestPatch };
  }
}
