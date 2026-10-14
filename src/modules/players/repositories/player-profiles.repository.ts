import "server-only";
import type { Db } from "mongodb";
import type { PlayerProfileSnapshot } from "@/modules/matches/domain/read-models";
import { PLAYER_COLLECTIONS, type PlayerProfileDoc } from "../players.model";
import type { ProfileSnapshotStore } from "../players.ports";

/** Kept 30 days after the last fetch; anything older is fetched again anyway. */
const SNAPSHOT_TTL_SECONDS = 30 * 24 * 3600;

export class PlayerProfilesRepository implements ProfileSnapshotStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<PlayerProfileDoc>(PLAYER_COLLECTIONS.profiles);
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ fetchedAt: 1 }, { name: "ttl", expireAfterSeconds: SNAPSHOT_TTL_SECONDS });
  }

  async getMany(accountIds: readonly number[]) {
    const out = new Map<number, PlayerProfileSnapshot & { fetchedAt: Date }>();
    if (accountIds.length === 0) return out;
    const docs = await (
      await this.col()
    )
      .find({ _id: { $in: [...new Set(accountIds)] } })
      .toArray();
    for (const { _id, ...rest } of docs) out.set(_id, { accountId32: _id, ...rest });
    return out;
  }

  async save(profile: PlayerProfileSnapshot, fetchedAt: Date): Promise<void> {
    const { accountId32, ...rest } = profile;
    await (
      await this.col()
    ).updateOne({ _id: accountId32 }, { $set: { ...rest, fetchedAt } }, { upsert: true });
  }
}
