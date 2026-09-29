import type { Collection, Db } from "mongodb";
import type { PlayerFollow } from "../domain/follow";
import type { FollowRepository } from "../application/ports";

const SCHEMA_VERSION = 1;
export const PLAYER_COLLECTIONS = { follows: "player_follows" } as const;

interface FollowDoc extends PlayerFollow {
  schemaVersion: number;
}

export async function ensurePlayerIndexes(db: Db): Promise<void> {
  const col = db.collection(PLAYER_COLLECTIONS.follows);
  await col.createIndex({ userId: 1, accountId32: 1 }, { name: "by_user_account", unique: true });
  // Serves the per-user list (newest first) and counts; its userId prefix is the user index.
  await col.createIndex({ userId: 1, createdAt: -1 }, { name: "by_user_recent" });
}

const toFollow = (d: FollowDoc): PlayerFollow => ({
  userId: d.userId,
  accountId32: d.accountId32,
  createdAt: d.createdAt,
});

export class MongoFollowRepository implements FollowRepository {
  private readonly col: Collection<FollowDoc>;

  constructor(db: Db) {
    this.col = db.collection<FollowDoc>(PLAYER_COLLECTIONS.follows);
  }

  async add(follow: PlayerFollow): Promise<boolean> {
    // Upsert keeps it idempotent; the unique index settles concurrent inserts.
    try {
      const res = await this.col.updateOne(
        { userId: follow.userId, accountId32: follow.accountId32 },
        { $setOnInsert: { ...follow, schemaVersion: SCHEMA_VERSION } },
        { upsert: true },
      );
      return res.upsertedCount === 1;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return false;
      throw e;
    }
  }

  async remove(userId: string, accountId32: number): Promise<boolean> {
    const res = await this.col.deleteOne({ userId, accountId32 });
    return res.deletedCount === 1;
  }

  async list(userId: string): Promise<PlayerFollow[]> {
    const docs = await this.col.find({ userId }).sort({ createdAt: -1 }).limit(1_000).toArray();
    return docs.map(toFollow);
  }

  count(userId: string): Promise<number> {
    return this.col.countDocuments({ userId });
  }

  async find(userId: string, accountId32: number): Promise<PlayerFollow | null> {
    const doc = await this.col.findOne({ userId, accountId32 });
    return doc ? toFollow(doc) : null;
  }
}
