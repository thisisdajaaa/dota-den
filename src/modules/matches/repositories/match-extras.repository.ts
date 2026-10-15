import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { MatchExtras } from "../domain/match-extras";
import type { MatchExtrasStore, PendingExtras } from "../matches.ports";
import { MATCH_COLLECTIONS, type PlayerMatchFactDoc } from "./matches.repository";

export interface MatchExtrasDoc extends MatchExtras {
  /** `${accountId32}:${matchId}` */
  _id: string;
  fetchedAt: Date;
  schemaVersion: number;
}

const SCHEMA_VERSION = 1;
export const matchExtrasId = (accountId32: number, matchId: string) => `${accountId32}:${matchId}`;

/** Extras from parsed replays (one document per player and match), each fetched once. */
export class MatchExtrasRepository implements MatchExtrasStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<MatchExtrasDoc>(MATCH_COLLECTIONS.extras);
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
    return rows.map((r) => ({
      matchId: r.matchId,
      heroId: r.heroId,
      side: r.side,
      result: r.result,
      startedAt: r.startedAt,
    }));
  }

  async fetchedSince(accountId32: number, since: Date): Promise<number> {
    return (await this.col()).countDocuments({ accountId32, fetchedAt: { $gte: since } });
  }

  async save(extras: MatchExtras, fetchedAt: Date): Promise<void> {
    await (
      await this.col()
    ).updateOne(
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
