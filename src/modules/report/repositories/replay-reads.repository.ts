import "server-only";
import type { Db } from "mongodb";
import type { DataOwner } from "@/common/privacy/user-data";
import type { ReplaySummary } from "../domain/replay-summary";
import {
  REPLAY_READS_COLLECTION,
  REPLAY_READS_KEEP_S,
  replayReadId,
  type ReplayReadDocument,
} from "../report.model";
import type { ReplayReadsPort } from "../report.ports";

/** Lane outcomes and objectives per parsed match and player, so each replay is read once. */
export class ReplayReadsRepository implements ReplayReadsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<ReplayReadDocument>(REPLAY_READS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex(
      { computedAt: 1 },
      { expireAfterSeconds: REPLAY_READS_KEEP_S, name: "ttl_365d" },
    );
    await col.createIndex({ accountId32: 1 }, { name: "by_account" });
  }

  /** Saved summaries for one player, by match id. */
  async find(accountId32: number, matchIds: readonly string[]) {
    const docs = await (
      await this.col()
    )
      .find({ _id: { $in: matchIds.map((m) => replayReadId(m, accountId32)) } })
      .toArray();
    return new Map(
      docs.map(({ _id, accountId32: _a, computedAt: _c, ...s }) => [_id.split(":")[0], s]),
    );
  }

  async save(matchId: string, accountId32: number, s: ReplaySummary): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: replayReadId(matchId, accountId32) },
      { $set: { ...s, accountId32, computedAt: new Date() } },
      { upsert: true },
    );
  }

  /** Summaries of public matches, kept per account: counted in the export, removed with it. */
  async countForOwner(owner: DataOwner): Promise<number> {
    return (await this.col()).countDocuments({ accountId32: owner.accountId32 });
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ accountId32: owner.accountId32 })).deletedCount;
  }
}
