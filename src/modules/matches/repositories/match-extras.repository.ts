import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { MatchExtras } from "../domain/match-extras";
import type { MatchExtrasStore, PendingExtras, StoredLane, StoredWardGame } from "../matches.ports";
import { MATCH_COLLECTIONS, type PlayerMatchFactDoc } from "./matches.repository";

export interface MatchExtrasDoc extends MatchExtras {
  /** `${accountId32}:${matchId}` */
  _id: string;
  fetchedAt: Date;
  schemaVersion: number;
}

/**
 * 2: lanePartnerHeroIds. 3: side and wards. 4: runes. Parsed games stored before are fetched again, after
 * new games, within the same daily cap.
 */
const SCHEMA_VERSION = 4;
export const matchExtrasId = (accountId32: number, matchId: string) => `${accountId32}:${matchId}`;

/** Extras from parsed replays (one document per player and match), each fetched once. */
export class MatchExtrasRepository implements MatchExtrasStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<MatchExtrasDoc>(MATCH_COLLECTIONS.extras);
  }

  private async syncState() {
    return (await this.getDb()).collection<{ accountId32: number; extrasLeaseUntil?: Date | null }>(
      MATCH_COLLECTIONS.syncState,
    );
  }

  private async facts() {
    return (await this.getDb()).collection<PlayerMatchFactDoc>(MATCH_COLLECTIONS.facts);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ accountId32: 1, heroId: 1, startedAt: -1 }, { name: "by_account_hero" }),
      col.createIndex({ accountId32: 1, fetchedAt: -1 }, { name: "by_account_fetched" }),
      (await this.facts()).createIndex(
        { accountId32: 1, "provenance.parseStatus": 1, startedAt: -1 },
        { name: "by_account_parse_status" },
      ),
    ]);
  }

  async pendingParsed(accountId32: number, limit: number): Promise<PendingExtras[]> {
    if (limit <= 0) return [];
    const stored = await (
      await this.col()
    )
      .find({ accountId32 }, { projection: { matchId: 1 } })
      .toArray();
    const rows = await (
      await this.facts()
    )
      .find(
        {
          accountId32,
          "provenance.parseStatus": "parsed",
          matchId: { $nin: stored.map((d) => d.matchId) },
        },
        { projection: { matchId: 1, heroId: 1, side: 1, result: 1, startedAt: 1 } },
      )
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray();
    const pending = rows.map((r) => ({
      matchId: r.matchId,
      heroId: r.heroId,
      side: r.side,
      result: r.result,
      startedAt: r.startedAt,
    }));
    if (pending.length >= limit) return pending;
    // Then parsed games stored before the current schema (e.g. without lane partners).
    const stale = await (
      await this.col()
    )
      .find(
        { accountId32, parsed: true, schemaVersion: { $lt: SCHEMA_VERSION } },
        { projection: { matchId: 1 } },
      )
      .sort({ startedAt: -1 })
      .limit(limit - pending.length)
      .toArray();
    if (stale.length === 0) return pending;
    const facts = await (
      await this.facts()
    )
      .find(
        { accountId32, matchId: { $in: stale.map((d) => d.matchId) } },
        { projection: { matchId: 1, heroId: 1, side: 1, result: 1, startedAt: 1 } },
      )
      .sort({ startedAt: -1 })
      .toArray();
    return [
      ...pending,
      ...facts.map((r) => ({
        matchId: r.matchId,
        heroId: r.heroId,
        side: r.side,
        result: r.result,
        startedAt: r.startedAt,
      })),
    ];
  }

  async fetchedSince(accountId32: number, since: Date): Promise<number> {
    return (await this.col()).countDocuments({ accountId32, fetchedAt: { $gte: since } });
  }

  async lease(accountId32: number, now: Date, until: Date): Promise<boolean> {
    // On the account's sync state, which every synced account has (and account deletion
    // removes). A missing field matches `null`.
    const res = await (
      await this.syncState()
    ).updateOne(
      { accountId32, $or: [{ extrasLeaseUntil: null }, { extrasLeaseUntil: { $lte: now } }] },
      { $set: { extrasLeaseUntil: until } },
    );
    return res.modifiedCount === 1;
  }

  async releaseLease(accountId32: number, until: Date): Promise<void> {
    await (
      await this.syncState()
    ).updateOne({ accountId32, extrasLeaseUntil: until }, { $set: { extrasLeaseUntil: null } });
  }

  async save(extras: MatchExtras, fetchedAt: Date): Promise<void> {
    const col = await this.col();
    if (!extras.parsed) {
      // A refetch that comes back without a replay never wipes a game stored as parsed.
      const kept = await col.updateOne(
        { _id: matchExtrasId(extras.accountId32, extras.matchId), parsed: true },
        { $set: { fetchedAt, schemaVersion: SCHEMA_VERSION } },
      );
      if (kept.matchedCount === 1) return;
    }
    await col.updateOne(
      { _id: matchExtrasId(extras.accountId32, extras.matchId) },
      { $set: { ...extras, fetchedAt, schemaVersion: SCHEMA_VERSION } },
      { upsert: true },
    );
  }

  async forHero(accountId32: number, heroId: number): Promise<MatchExtras[]> {
    const docs = await (
      await this.col()
    )
      .find({ accountId32, heroId, parsed: true })
      .sort({ startedAt: -1 })
      .toArray();
    return docs.map(({ _id, fetchedAt: _f, schemaVersion: _v, ...extras }) => extras);
  }

  /** Lanes of every stored parsed game (for deeper stats), newest first. */
  async lanesForAccount(accountId32: number): Promise<StoredLane[]> {
    const docs = await (
      await this.col()
    )
      .find(
        { accountId32, parsed: true },
        {
          projection: {
            _id: 0,
            matchId: 1,
            heroId: 1,
            laneRole: 1,
            roaming: 1,
            laneResult: 1,
            lanePartnerHeroIds: 1,
          },
        },
      )
      .sort({ startedAt: -1 })
      .toArray();
    return docs.map((d) => ({
      matchId: d.matchId,
      heroId: d.heroId,
      laneRole: d.laneRole ?? null,
      roaming: d.roaming ?? false,
      laneResult: d.laneResult ?? null,
      ...(d.lanePartnerHeroIds !== undefined ? { lanePartnerHeroIds: d.lanePartnerHeroIds } : {}),
    }));
  }

  /** Your wards in your latest stored parsed games that have them, newest first. */
  async wardsForAccount(accountId32: number, limit: number): Promise<StoredWardGame[]> {
    const docs = await (
      await this.col()
    )
      .find(
        { accountId32, parsed: true, wards: { $type: "array" } },
        {
          projection: {
            _id: 0,
            matchId: 1,
            heroId: 1,
            startedAt: 1,
            result: 1,
            side: 1,
            wards: 1,
            runes: 1,
          },
        },
      )
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((d) => ({
      matchId: d.matchId,
      heroId: d.heroId,
      startedAt: d.startedAt,
      result: d.result,
      side: d.side ?? null,
      wards: d.wards ?? [],
      runes: Array.isArray(d.runes) ? d.runes : null,
    }));
  }

  async parsedGamesOnHero(accountId32: number, heroId: number): Promise<number> {
    return (await this.facts()).countDocuments({
      accountId32,
      heroId,
      "provenance.parseStatus": "parsed",
    });
  }

  /** Your stored extras, for "Download your data". */
  async exportForOwner(owner: Pick<DataOwner, "accountId32">) {
    const docs = await (
      await this.col()
    )
      .find({ accountId32: owner.accountId32 })
      .sort({ startedAt: -1 })
      .toArray();
    return forExport(docs as unknown as Array<Record<string, unknown>>);
  }

  async deleteForOwner(owner: Pick<DataOwner, "accountId32">): Promise<number> {
    return (await (await this.col()).deleteMany({ accountId32: owner.accountId32 })).deletedCount;
  }
}
