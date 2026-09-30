import type { AnyBulkWriteOperation, Collection, Db } from "mongodb";
import type { PlayerMatchFact } from "../domain/player-match-fact";
import type { QueueClass } from "../domain/queue-classification";
import { decodeCursor, encodeCursor, type MatchListFilter } from "../application/match-list-filter";
import type {
  DashboardFact,
  MatchListPage,
  RankedResultRow,
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
            historyRefreshRequestedAt: null,
            rescannedAt: null,
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
    // Older documents predate this field.
    historyRefreshRequestedAt: doc.historyRefreshRequestedAt ?? null,
    rescannedAt: doc.rescannedAt ?? null,
  };
}

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === 11000;
}

const FACT_PROJECTION = {
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
} as const;

function toDashboardFact(d: PlayerMatchFactDoc): DashboardFact {
  return {
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
  };
}

export class MongoMatchQueries implements MatchQueries {
  constructor(private readonly db: Db) {}

  private get facts(): Collection<PlayerMatchFactDoc> {
    return this.db.collection<PlayerMatchFactDoc>(MATCH_COLLECTIONS.facts);
  }

  private async latestPatch(accountId32: number): Promise<string | null> {
    const latest = await this.facts.findOne(
      { accountId32 },
      { sort: { startedAt: -1 }, projection: { "patch.patch": 1 } },
    );
    return latest?.patch.patch ?? null;
  }

  async listMatches(
    accountId32: number,
    filter: MatchListFilter,
    now: Date,
    limit: number,
  ): Promise<MatchListPage> {
    const latestPatch = await this.latestPatch(accountId32);
    // Only allow-listed, typed values reach the query (no user-controlled operators).
    const base: Record<string, unknown> = { accountId32 };
    if (filter.mode === "ranked") base.ranked = true;
    if (filter.range === "30d")
      base.startedAt = { $gte: new Date(now.getTime() - 30 * 86_400_000) };
    if (filter.range === "patch") base["patch.patch"] = latestPatch;
    if (filter.queue !== "all") base["queue.queueClass"] = filter.queue;
    if (filter.hero !== undefined) base.heroId = filter.hero;
    // The record ignores the result filter; the list and its count apply it.
    const listed: Record<string, unknown> =
      filter.result === "all" ? base : { ...base, result: filter.result };

    const page: Record<string, unknown> = { ...listed };
    const cursor = filter.cursor ? decodeCursor(filter.cursor) : null;
    if (cursor) {
      page.$or = [
        { startedAt: { $lt: cursor.startedAt } },
        { startedAt: cursor.startedAt, matchId: { $lt: cursor.matchId } },
      ];
    }

    const [docs, totals] = await Promise.all([
      this.facts
        .find(page, {
          sort: { startedAt: -1, matchId: -1 },
          limit: limit + 1,
          projection: FACT_PROJECTION,
        })
        .toArray(),
      this.facts
        .aggregate<{ games: number; wins: number; losses: number }>([
          { $match: base },
          {
            $group: {
              _id: null,
              games: { $sum: 1 },
              wins: { $sum: { $cond: [{ $eq: ["$result", "win"] }, 1, 0] } },
              losses: { $sum: { $cond: [{ $eq: ["$result", "loss"] }, 1, 0] } },
            },
          },
        ])
        .toArray(),
    ]);

    const items = docs.slice(0, limit).map(toDashboardFact);
    const last = items.at(-1);
    return {
      items,
      nextCursor: docs.length > limit && last ? encodeCursor(last.startedAt, last.matchId) : null,
      matching:
        filter.result === "win"
          ? (totals[0]?.wins ?? 0)
          : filter.result === "loss"
            ? (totals[0]?.losses ?? 0)
            : (totals[0]?.games ?? 0),
      record: { games: totals[0]?.games ?? 0, wins: totals[0]?.wins ?? 0 },
      latestPatch,
    };
  }

  async rankedResults(
    accountId32: number,
    range: { from: Date; to: Date },
  ): Promise<RankedResultRow[]> {
    const docs = await this.facts
      .find(
        { accountId32, ranked: true, startedAt: { $gte: range.from, $lte: range.to } },
        {
          projection: {
            _id: 0,
            matchId: 1,
            startedAt: 1,
            heroId: 1,
            result: 1,
            "queue.queueClass": 1,
          },
          limit: 20_000,
        },
      )
      .toArray();
    return docs.map((d) => ({
      matchId: d.matchId,
      startedAt: d.startedAt,
      heroId: d.heroId,
      result: d.result,
      queueClass: d.queue.queueClass,
    }));
  }

  async playedHeroes(accountId32: number): Promise<Array<{ heroId: number; games: number }>> {
    const rows = await this.facts
      .aggregate<{ _id: number; games: number }>([
        { $match: { accountId32 } },
        { $group: { _id: "$heroId", games: { $sum: 1 } } },
        { $sort: { games: -1 } },
      ])
      .toArray();
    return rows.map((r) => ({ heroId: r._id, games: r.games }));
  }

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
    const latestPatch = await this.latestPatch(accountId32);
    const query: Record<string, unknown> = { accountId32 };
    if (filter.mode === "ranked") query.ranked = true;
    if (filter.range === "30d")
      query.startedAt = { $gte: new Date(now.getTime() - 30 * 86_400_000) };
    if (filter.range === "patch") query["patch.patch"] = latestPatch;

    const docs = await this.facts
      .find(query, { sort: { startedAt: -1 }, limit: 5_000, projection: FACT_PROJECTION })
      .toArray();
    return { facts: docs.map(toDashboardFact), latestPatch };
  }
}

/** Admin overview: imported matches and sync state per account. */
export async function matchStatsByAccount(
  db: Db,
  accountIds: readonly number[],
): Promise<Map<number, { matches: number; lastSyncAt: Date | null; backfillComplete: boolean }>> {
  const ids = [...accountIds];
  const [counts, states] = await Promise.all([
    db
      .collection(MATCH_COLLECTIONS.facts)
      .aggregate<{ _id: number; n: number }>([
        { $match: { accountId32: { $in: ids } } },
        { $group: { _id: "$accountId32", n: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection(MATCH_COLLECTIONS.syncState)
      .find(
        { accountId32: { $in: ids } },
        { projection: { accountId32: 1, lastSyncAt: 1, backfillComplete: 1 } },
      )
      .toArray(),
  ]);
  const n = new Map(counts.map((c) => [c._id, c.n]));
  const out = new Map<
    number,
    { matches: number; lastSyncAt: Date | null; backfillComplete: boolean }
  >();
  for (const id of ids) {
    const s = states.find((x) => x.accountId32 === id);
    out.set(id, {
      matches: n.get(id) ?? 0,
      lastSyncAt: (s?.lastSyncAt as Date | null | undefined) ?? null,
      backfillComplete: Boolean(s?.backfillComplete),
    });
  }
  return out;
}
