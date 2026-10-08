import "server-only";
import { ObjectId, type Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { toAccountId32, type AccountId32, type SteamId64 } from "../domain/steam-id";
import { DEFAULT_USER_SETTINGS, type ProfileVisibility, type User } from "../domain/user";
import {
  IDENTITY_COLLECTIONS,
  IDENTITY_SCHEMA_VERSION,
  type AdminUserRow,
  type UserDocument,
} from "../identity.model";
import type { UserRepository } from "../identity.ports";

function toUser(doc: UserDocument): User {
  return {
    id: doc._id.toHexString(),
    steamId64: doc.steamId64 as SteamId64,
    accountId32: doc.accountId32 as AccountId32,
    persona: doc.persona,
    settings: doc.settings,
    roles: doc.roles,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class UsersRepository implements UserRepository {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<UserDocument>(IDENTITY_COLLECTIONS.users);
  }

  async upsertBySteamId({
    steamId64,
    isAdmin,
    now,
  }: {
    steamId64: SteamId64;
    isAdmin: boolean;
    now: Date;
  }): Promise<User> {
    const doc = await (
      await this.col()
    ).findOneAndUpdate(
      { steamId64 },
      {
        $set: { updatedAt: now, roles: isAdmin ? ["admin"] : [] },
        $setOnInsert: {
          schemaVersion: IDENTITY_SCHEMA_VERSION,
          steamId64,
          accountId32: toAccountId32(steamId64),
          persona: null,
          settings: DEFAULT_USER_SETTINGS,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!doc) throw new Error("User upsert returned no document");
    return toUser(doc);
  }

  async setPersona(id: string, persona: NonNullable<User["persona"]>): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await (await this.col()).updateOne({ _id: new ObjectId(id) }, { $set: { persona } });
  }

  async findById(id: string): Promise<User | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await (await this.col()).findOne({ _id: new ObjectId(id) });
    return doc ? toUser(doc) : null;
  }

  async findByIds(ids: readonly string[]): Promise<User[]> {
    const valid = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (valid.length === 0) return [];
    return (await (await this.col()).find({ _id: { $in: valid } }).toArray()).map(toUser);
  }

  /** Users who chose to be listed publicly (e.g. on the Everyone leaderboards). */
  async findPublicIds(limit: number): Promise<string[]> {
    const docs = await (
      await this.col()
    )
      .find({ "settings.profileVisibility": "public" }, { projection: { _id: 1 } })
      .limit(limit)
      .toArray();
    return docs.map((d) => d._id.toHexString());
  }

  /** The user's chosen UI language. */
  async setLanguage(id: string, language: string, now: Date): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const res = await (
      await this.col()
    ).updateOne(
      { _id: new ObjectId(id) },
      { $set: { "settings.language": language, updatedAt: now } },
    );
    return res.matchedCount === 1;
  }

  async setProfileVisibility(
    id: string,
    visibility: ProfileVisibility,
    now: Date,
  ): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const res = await (
      await this.col()
    ).updateOne(
      { _id: new ObjectId(id) },
      { $set: { "settings.profileVisibility": visibility, updatedAt: now } },
    );
    return res.matchedCount === 1;
  }

  /** The users among these Steam accounts (most won't have signed in to Dota Den). */
  async findByAccountIds(accountIds: readonly number[]): Promise<User[]> {
    if (accountIds.length === 0) return [];
    return (await (await this.col()).find({ accountId32: { $in: [...accountIds] } }).toArray()).map(
      toUser,
    );
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ steamId64: 1 }, { unique: true, name: "uniq_steamId64" }),
      // Which of a player's friends have accounts (leaderboards).
      col.createIndex({ accountId32: 1 }, { name: "by_accountId32" }),
      col.createIndex({ "settings.profileVisibility": 1 }, { name: "by_profileVisibility" }),
    ]);
  }

  /** Admin overview: every user with their session count and last activity. */
  async adminRows(): Promise<AdminUserRow[]> {
    const db = await this.getDb();
    const [users, sessions] = await Promise.all([
      db.collection(IDENTITY_COLLECTIONS.users).find({}).sort({ createdAt: -1 }).toArray(),
      db
        .collection(IDENTITY_COLLECTIONS.sessions)
        .aggregate<{ _id: string; n: number; last: Date | null }>([
          { $group: { _id: "$userId", n: { $sum: 1 }, last: { $max: "$rotatedAt" } } },
        ])
        .toArray(),
    ]);
    const byUser = new Map(sessions.map((s) => [String(s._id), s]));
    return users.map((u) => {
      const s = byUser.get(u._id.toHexString());
      return {
        userId: u._id.toHexString(),
        accountId32: u.accountId32 as number,
        createdAt: u.createdAt as Date,
        isAdmin: ((u.roles as string[] | undefined) ?? []).includes("admin"),
        profileVisibility: (u.settings?.profileVisibility as string | undefined) ?? "private",
        sessions: s?.n ?? 0,
        lastSeenAt: s?.last ?? null,
      };
    });
  }

  /** Your account, for "Download your data" (no session tokens). */
  async exportForOwner(owner: DataOwner) {
    if (!ObjectId.isValid(owner.userId)) return [];
    return forExport(await (await this.col()).find({ _id: new ObjectId(owner.userId) }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    if (!ObjectId.isValid(owner.userId)) return 0;
    return (await (await this.col()).deleteOne({ _id: new ObjectId(owner.userId) })).deletedCount;
  }
}
