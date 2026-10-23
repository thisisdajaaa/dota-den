import "server-only";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { PlayerMatchFact } from "../domain/player-match-fact";
import type { QueueClass } from "../domain/queue-classification";
import {
  decodeCursor,
  encodeCursor,
  type MatchListFilter,
} from "../schemas/match-list-filter.schema";
import type {
  DashboardFact,
  DashboardSummaryFact,
  DashboardView,
  MatchListPage,
  RankedResultRow,
  DashboardFacts,
  DashboardFilter,
  ImportStatus,
  LineupCoverage,
  LineupFacts,
  LineupFilter,
  LockOutcome,
  MatchQueries,
  MatchFactsPort,
  SyncState,
  SyncStatesPort,
} from "../matches.ports";

/**
 * 2: facts carry both lineups (allyHeroIds, enemyHeroIds). Facts below 2 were stored before
 * lineups were kept; the lineup backfill re-reads them.
 */
const SCHEMA_VERSION = 2;
/** Facts at or above this version have been read with their lineups. */
const LINEUPS_SINCE_VERSION = 2;

export const MATCH_COLLECTIONS = {
  matches: "matches",
  facts: "player_match_facts",
  syncState: "match_sync_state",
  /** Per-match extras from parsed replays (item timings, lanes), per player. */
  extras: "match_extras",
  /** AI match coach reviews, kept for good (ADR 0014). */
  coachReviews: "match_coach_reviews",
  /** Free coach reviews written (the rolling 7-day quota), with short-lived holds. */
  coachUsage: "match_coach_usage",
  /** Matches asked to be parsed by Plus auto requests (dedupe, expires). */
  parseRequests: "match_parse_requests",
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

export class MatchFactsRepository implements MatchFactsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  /** Facts, shared match records and sync state. */
  async ensureIndexes(): Promise<void> {
    const db = await this.getDb();
    const facts = db.collection(MATCH_COLLECTIONS.facts);
    const matches = db.collection(MATCH_COLLECTIONS.matches);
    await Promise.all([
      facts.createIndex(
        { accountId32: 1, matchId: 1 },
        { unique: true, name: "uniq_account_match" },
      ),
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

  private async facts() {
    return (await this.getDb()).collection<PlayerMatchFactDoc>(MATCH_COLLECTIONS.facts);
  }

  private async matches() {
    return (await this.getDb()).collection<MatchDoc>(MATCH_COLLECTIONS.matches);
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
      (await this.facts()).bulkWrite(factOps, { ordered: false }),
      (await this.matches()).bulkWrite(matchOps, { ordered: false }),
    ]);
    return { inserted: factRes.upsertedCount, updated: factRes.matchedCount };
  }

  async countWithoutLineups(accountId32: number): Promise<number> {
    return (await this.facts()).countDocuments({
      accountId32,
      schemaVersion: { $not: { $gte: LINEUPS_SINCE_VERSION } },
    });
  }
}

export class SyncStatesRepository implements SyncStatesPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<SyncStateDoc>(MATCH_COLLECTIONS.syncState);
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
      const doc = await (
        await this.col()
      ).findOneAndUpdate(
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
            lineupBackfillOffset: 0,
            lineupBackfillComplete: false,
          },
        },
        { upsert: true, returnDocument: "after" },
      );
      if (!doc) throw new Error("sync state upsert returned no document");
      return { type: "acquired", state: toState(doc) };
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      // The document exists but didn't match: it's either locked or cooling down.
      const existing = await (await this.col()).findOne({ accountId32 });
      if (existing?.lockedUntil && existing.lockedUntil > now) return { type: "locked" };
      if (existing?.lastSyncAt) {
        const wait = existing.backfillComplete ? cooldownMs : backfillCooldownMs;
        return { type: "cooldown", retryAt: new Date(existing.lastSyncAt.getTime() + wait) };
      }
      return { type: "locked" };
    }
  }

  async release(accountId32: number, next: Omit<SyncState, "accountId32">): Promise<void> {
    await (await this.col()).updateOne({ accountId32 }, { $set: { ...next, lockedUntil: null } });
  }

  async abandon(accountId32: number): Promise<void> {
    await (await this.col()).updateOne({ accountId32 }, { $set: { lockedUntil: null } });
  }

  async dueForSync(limit: number): Promise<number[]> {
    const docs = await (
      await this.col()
    )
      .find({}, { projection: { _id: 0, accountId32: 1 } })
      // Longest wait first (never synced first of all). Unfinished imports don't jump the
      // queue: each run gives every account a turn, and long imports continue the next day.
      .sort({ lastSyncAt: 1, accountId32: 1 })
      .limit(limit)
      .toArray();
    return docs.map((d) => d.accountId32);
  }

  async get(accountId32: number): Promise<SyncState | null> {
    const doc = await (await this.col()).findOne({ accountId32 });
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
    lineupBackfillOffset: doc.lineupBackfillOffset ?? 0,
    lineupBackfillComplete: doc.lineupBackfillComplete ?? false,
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
  // Not the whole subdocuments: the classification's confidence and reason aren't read.
  "queue.queueClass": 1,
  "queue.partySize": 1,
  "patch.patch": 1,
  "patch.certainty": 1,
} as const;

/** Only what the dashboard summary reads: about half the bytes of a full row. */
export const SUMMARY_FACT_PROJECTION = {
  _id: 0,
  matchId: 1,
  startedAt: 1,
  heroId: 1,
  result: 1,
  kills: 1,
  deaths: 1,
  assists: 1,
  "queue.queueClass": 1,
  "queue.partySize": 1,
} as const;

/** The dashboard's (and its friends') cap: the newest games only. */
const DASHBOARD_FACT_LIMIT = 5_000;

type SummaryFactDoc = Pick<
  PlayerMatchFactDoc,
  "matchId" | "startedAt" | "heroId" | "result" | "kills" | "deaths" | "assists"
> & { queue: Pick<PlayerMatchFactDoc["queue"], "queueClass" | "partySize"> };

function toSummaryFact(d: SummaryFactDoc): DashboardSummaryFact {
  return {
    matchId: d.matchId,
    startedAt: d.startedAt,
    heroId: d.heroId,
    result: d.result,
    kills: d.kills,
    deaths: d.deaths,
    assists: d.assists,
    queueClass: d.queue.queueClass,
    partySize: d.queue.partySize,
  };
}

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

export class MatchReadRepository implements MatchQueries {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async facts() {
    return (await this.getDb()).collection<PlayerMatchFactDoc>(MATCH_COLLECTIONS.facts);
  }

  private async latestPatch(accountId32: number): Promise<string | null> {
    const latest = await (
      await this.facts()
    ).findOne({ accountId32 }, { sort: { startedAt: -1 }, projection: { "patch.patch": 1 } });
    return latest?.patch.patch ?? null;
  }

  async listMatches(
    accountId32: number,
    filter: MatchListFilter,
    now: Date,
    limit: number,
    onlyMatchIds?: readonly string[],
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
    if (onlyMatchIds) base.matchId = { $in: [...onlyMatchIds] };
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
      (await this.facts())
        .find(page, {
          sort: { startedAt: -1, matchId: -1 },
          limit: limit + 1,
          projection: FACT_PROJECTION,
        })
        .toArray(),
      (await this.facts())
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
    const docs = await (
      await this.facts()
    )
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
            kills: 1,
            deaths: 1,
            assists: 1,
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
      kills: d.kills,
      deaths: d.deaths,
      assists: d.assists,
    }));
  }

  async factsBetween(
    accountId32: number,
    range: { from: Date; to: Date },
  ): Promise<DashboardFact[]> {
    const docs = await (
      await this.facts()
    )
      .find(
        { accountId32, startedAt: { $gte: range.from, $lte: range.to } },
        { sort: { startedAt: 1 }, limit: 20_000, projection: FACT_PROJECTION },
      )
      .toArray();
    return docs.map(toDashboardFact);
  }

  async playedHeroes(accountId32: number): Promise<Array<{ heroId: number; games: number }>> {
    const rows = await (
      await this.facts()
    )
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
      new SyncStatesRepository(this.getDb).get(accountId32),
      (await this.facts())
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

  /**
   * The dashboard filter as a query, plus the latest patch. Only the "current patch" range
   * needs the patch before it can query; otherwise the caller reads both at once.
   */
  private async dashboardQuery(
    accountId32: number,
    filter: DashboardFilter,
    now: Date,
  ): Promise<{ query: Record<string, unknown>; latestPatch: Promise<string | null> }> {
    const latestPatch = this.latestPatch(accountId32);
    const query: Record<string, unknown> = { accountId32 };
    if (filter.mode === "ranked") query.ranked = true;
    if (filter.range === "30d")
      query.startedAt = { $gte: new Date(now.getTime() - 30 * 86_400_000) };
    if (filter.range === "patch") query["patch.patch"] = await latestPatch;
    return { query, latestPatch };
  }

  async dashboardFacts(
    accountId32: number,
    filter: DashboardFilter,
    now: Date,
  ): Promise<DashboardFacts> {
    const facts = await this.facts();
    // No await between starting the patch read and Promise.all, so its failure is never unhandled.
    const { query, latestPatch } = await this.dashboardQuery(accountId32, filter, now);
    const [docs, patch] = await Promise.all([
      facts
        .find(query, {
          sort: { startedAt: -1 },
          limit: DASHBOARD_FACT_LIMIT,
          projection: FACT_PROJECTION,
        })
        .toArray(),
      latestPatch,
    ]);
    return { facts: docs.map(toDashboardFact), latestPatch: patch };
  }

  async dashboardView(
    accountId32: number,
    filter: DashboardFilter,
    now: Date,
    recent: number,
  ): Promise<DashboardView> {
    const facts = await this.facts();
    // No await between starting the patch read and Promise.all, so its failure is never unhandled.
    const { query, latestPatch } = await this.dashboardQuery(accountId32, filter, now);
    // The same rows as dashboardFacts: lean ones for the summary, full ones for the newest few.
    const [lean, full, patch] = await Promise.all([
      facts
        .find(query, {
          sort: { startedAt: -1 },
          limit: DASHBOARD_FACT_LIMIT,
          projection: SUMMARY_FACT_PROJECTION,
        })
        .toArray(),
      facts
        .find(query, {
          sort: { startedAt: -1 },
          limit: Math.min(recent, DASHBOARD_FACT_LIMIT),
          projection: FACT_PROJECTION,
        })
        .toArray(),
      latestPatch,
    ]);
    return {
      facts: lean.map(toSummaryFact),
      recent: full.map(toDashboardFact),
      latestPatch: patch,
    };
  }

  async lineupFacts(accountId32: number, filter: LineupFilter, now: Date): Promise<LineupFacts> {
    const latestPatch = await this.latestPatch(accountId32);
    // Only allow-listed, typed values reach the query.
    const query: Record<string, unknown> = { accountId32 };
    if (filter.mode === "ranked") query.ranked = true;
    if (filter.range === "30d" || filter.range === "90d") {
      const days = filter.range === "30d" ? 30 : 90;
      query.startedAt = { $gte: new Date(now.getTime() - days * 86_400_000) };
    }
    if (filter.range === "patch") query["patch.patch"] = latestPatch;
    if (filter.heroId !== undefined) query.heroId = filter.heroId;
    const docs = await (
      await this.facts()
    )
      .find(query, {
        sort: { startedAt: -1 },
        limit: 20_000,
        projection: { _id: 0, matchId: 1, heroId: 1, result: 1, allyHeroIds: 1, enemyHeroIds: 1 },
      })
      .toArray();
    return {
      games: docs.map((d) => ({
        matchId: d.matchId,
        heroId: d.heroId,
        result: d.result,
        // Facts stored before lineups were kept have no such fields: missing, not empty.
        allyHeroIds: Array.isArray(d.allyHeroIds) ? d.allyHeroIds : null,
        enemyHeroIds: Array.isArray(d.enemyHeroIds) ? d.enemyHeroIds : null,
      })),
      latestPatch,
    };
  }

  async lineupCoverage(accountId32: number): Promise<LineupCoverage> {
    const facts = await this.facts();
    const [total, withLineups, pending, sync] = await Promise.all([
      facts.countDocuments({ accountId32 }),
      facts.countDocuments({ accountId32, "enemyHeroIds.0": { $exists: true } }),
      facts.countDocuments({
        accountId32,
        schemaVersion: { $not: { $gte: LINEUPS_SINCE_VERSION } },
      }),
      new SyncStatesRepository(this.getDb).get(accountId32),
    ]);
    return {
      total,
      withLineups,
      pending,
      complete: pending === 0 || sync?.lineupBackfillComplete === true,
    };
  }

  async startedAfter(
    accountId32: number,
    after: Date,
    opts: { excludeMatchIds: readonly string[]; limit: number },
  ): Promise<Array<DashboardFact & { gameMode: number | null }>> {
    const query: Record<string, unknown> = { accountId32, startedAt: { $gt: after } };
    if (opts.excludeMatchIds.length > 0) query.matchId = { $nin: [...opts.excludeMatchIds] };
    const docs = await (
      await this.facts()
    )
      .find(query, {
        sort: { startedAt: 1 },
        limit: opts.limit,
        projection: { ...FACT_PROJECTION, gameMode: 1 },
      })
      .toArray();
    return docs.map((d) => ({ ...toDashboardFact(d), gameMode: d.gameMode ?? null }));
  }

  /** Admin overview: imported matches and sync state per account. */
  async statsByAccount(
    accountIds: readonly number[],
  ): Promise<Map<number, { matches: number; lastSyncAt: Date | null; backfillComplete: boolean }>> {
    const db = await this.getDb();
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

  /** Your imported matches and sync state, for "Download your data". */
  async exportForOwner(owner: DataOwner) {
    const db = await this.getDb();
    const [facts, sync] = await Promise.all([
      db
        .collection(MATCH_COLLECTIONS.facts)
        .find({ accountId32: owner.accountId32 })
        .sort({ startedAt: -1 })
        .toArray(),
      db.collection(MATCH_COLLECTIONS.syncState).find({ accountId32: owner.accountId32 }).toArray(),
    ]);
    return { matches: forExport(facts), matchSync: forExport(sync) };
  }

  /** Your imported matches (public data, re-imported if you sign in again). Shared match records stay. */
  async deleteForOwner(owner: DataOwner) {
    const db = await this.getDb();
    const [facts, sync] = await Promise.all([
      db.collection(MATCH_COLLECTIONS.facts).deleteMany({ accountId32: owner.accountId32 }),
      db.collection(MATCH_COLLECTIONS.syncState).deleteMany({ accountId32: owner.accountId32 }),
    ]);
    return { matches: facts.deletedCount, matchSync: sync.deletedCount };
  }
}
