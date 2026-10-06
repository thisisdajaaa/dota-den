import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { shouldRecord } from "../domain/medal-history";
import { MEDAL_COLLECTION, type MedalDoc } from "../mmr.model";

/** Medal sightings per account (`rank_history`), from public profiles. */
export class MedalHistoryRepository {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<MedalDoc>(MEDAL_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ accountId32: 1, observedAt: -1 }, { name: "by_account_time" });
  }

  /**
   * Note a sighting of the player's medal: a new row when it changed, otherwise just bump the
   * latest row's lastSeenAt (so a change can be dated between two sightings).
   */
  async recordSighting(accountId32: number, rankTier: number | null, now: Date): Promise<void> {
    const col = await this.col();
    const last = await col.findOne({ accountId32 }, { sort: { observedAt: -1 } });
    if (shouldRecord(last, rankTier)) {
      await col.insertOne({ accountId32, rankTier: rankTier!, observedAt: now, lastSeenAt: now });
    } else if (last && last.rankTier === rankTier) {
      await col.updateOne({ _id: last._id }, { $set: { lastSeenAt: now } });
    }
  }

  /** Medal sightings, oldest first; repeats of the same medal merged. */
  async history(accountId32: number): Promise<MedalDoc[]> {
    const rows = await (
      await this.col()
    )
      .find({ accountId32 }, { projection: { _id: 0 } })
      .sort({ observedAt: 1 })
      .limit(500)
      .toArray();
    // Two page loads at the same moment can both add the same medal; merge such repeats.
    const out: MedalDoc[] = [];
    for (const r of rows) {
      const last = out.at(-1);
      if (last && last.rankTier === r.rankTier) {
        if (r.lastSeenAt > last.lastSeenAt) last.lastSeenAt = r.lastSeenAt;
      } else out.push(r);
    }
    return out;
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(
      await (
        await this.col()
      )
        .find({ accountId32: owner.accountId32 })
        .sort({ observedAt: 1 })
        .toArray(),
    );
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ accountId32: owner.accountId32 })).deletedCount;
  }
}
