import type { Db } from "mongodb";
import "server-only";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { PlayerFollow } from "../domain/follow";
import { PLAYER_COLLECTIONS, PLAYERS_SCHEMA_VERSION, type FollowDoc } from "../players.model";
import type { FollowsPort } from "../players.ports";

const toFollow = (d: FollowDoc): PlayerFollow => ({
  userId: d.userId,
  accountId32: d.accountId32,
  createdAt: d.createdAt,
});

export class FollowsRepository implements FollowsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<FollowDoc>(PLAYER_COLLECTIONS.follows);
  }

  async add(follow: PlayerFollow): Promise<boolean> {
    // Upsert keeps it idempotent; the unique index settles concurrent inserts.
    try {
      const res = await (
        await this.col()
      ).updateOne(
        { userId: follow.userId, accountId32: follow.accountId32 },
        { $setOnInsert: { ...follow, schemaVersion: PLAYERS_SCHEMA_VERSION } },
        { upsert: true },
      );
      return res.upsertedCount === 1;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return false;
      throw e;
    }
  }

  async remove(userId: string, accountId32: number): Promise<boolean> {
    const res = await (await this.col()).deleteOne({ userId, accountId32 });
    return res.deletedCount === 1;
  }

  async list(userId: string): Promise<PlayerFollow[]> {
    const docs = await (
      await this.col()
    )
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(1_000)
      .toArray();
    return docs.map(toFollow);
  }

  async count(userId: string): Promise<number> {
    return (await this.col()).countDocuments({ userId });
  }

  async find(userId: string, accountId32: number): Promise<PlayerFollow | null> {
    const doc = await (await this.col()).findOne({ userId, accountId32 });
    return doc ? toFollow(doc) : null;
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex({ userId: 1, accountId32: 1 }, { name: "by_user_account", unique: true });
    // Serves the per-user list (newest first) and counts; its userId prefix is the user index.
    await col.createIndex({ userId: 1, createdAt: -1 }, { name: "by_user_recent" });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
