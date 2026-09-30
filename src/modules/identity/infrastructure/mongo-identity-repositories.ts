import "server-only";
import { ObjectId, type Collection, type Db } from "mongodb";
import { toAccountId32, type AccountId32, type SteamId64 } from "../domain/steam-id";
import { DEFAULT_USER_SETTINGS, type User } from "../domain/user";
import type {
  NonceStore,
  SessionRecord,
  SessionRepository,
  UserRepository,
} from "../application/ports";

const SCHEMA_VERSION = 1;

interface UserDoc {
  _id: ObjectId;
  schemaVersion: number;
  steamId64: string;
  accountId32: number;
  persona: User["persona"];
  settings: User["settings"];
  roles: Array<"admin">;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionDoc extends SessionRecord {
  schemaVersion: number;
}

interface NonceDoc {
  _id: string;
  expiresAt: Date;
}

export const IDENTITY_COLLECTIONS = {
  users: "users",
  sessions: "auth_sessions",
  nonces: "auth_nonces",
} as const;

export async function ensureIdentityIndexes(db: Db): Promise<void> {
  await Promise.all([
    db
      .collection(IDENTITY_COLLECTIONS.users)
      .createIndex({ steamId64: 1 }, { unique: true, name: "uniq_steamId64" }),
    // Which of a player's friends have accounts (leaderboards).
    db
      .collection(IDENTITY_COLLECTIONS.users)
      .createIndex({ accountId32: 1 }, { name: "by_accountId32" }),
    db
      .collection(IDENTITY_COLLECTIONS.sessions)
      .createIndex({ tokenHash: 1 }, { unique: true, name: "uniq_tokenHash" }),
    db.collection(IDENTITY_COLLECTIONS.sessions).createIndex({ userId: 1 }, { name: "by_user" }),
    db
      .collection(IDENTITY_COLLECTIONS.sessions)
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
    db
      .collection(IDENTITY_COLLECTIONS.nonces)
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
  ]);
}

function toUser(doc: UserDoc): User {
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

export class MongoUserRepository implements UserRepository {
  private readonly col: Collection<UserDoc>;

  constructor(db: Db) {
    this.col = db.collection<UserDoc>(IDENTITY_COLLECTIONS.users);
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
    const doc = await this.col.findOneAndUpdate(
      { steamId64 },
      {
        $set: { updatedAt: now, roles: isAdmin ? ["admin"] : [] },
        $setOnInsert: {
          schemaVersion: SCHEMA_VERSION,
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

  async findById(id: string): Promise<User | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await this.col.findOne({ _id: new ObjectId(id) });
    return doc ? toUser(doc) : null;
  }

  async findByIds(ids: readonly string[]): Promise<User[]> {
    const valid = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (valid.length === 0) return [];
    return (await this.col.find({ _id: { $in: valid } }).toArray()).map(toUser);
  }

  /** The users among these Steam accounts (most won't have signed in to Dota Den). */
  async findByAccountIds(accountIds: readonly number[]): Promise<User[]> {
    if (accountIds.length === 0) return [];
    return (await this.col.find({ accountId32: { $in: [...accountIds] } }).toArray()).map(toUser);
  }
}

export class MongoSessionRepository implements SessionRepository {
  private readonly col: Collection<SessionDoc>;

  constructor(db: Db) {
    this.col = db.collection<SessionDoc>(IDENTITY_COLLECTIONS.sessions);
  }

  async create(record: SessionRecord): Promise<void> {
    await this.col.insertOne({ ...record, schemaVersion: SCHEMA_VERSION });
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const doc = await this.col.findOne({ tokenHash }, { projection: { _id: 0, schemaVersion: 0 } });
    return doc;
  }

  async replace(oldTokenHash: string, next: SessionRecord): Promise<boolean> {
    const res = await this.col.updateOne({ tokenHash: oldTokenHash }, { $set: next });
    return res.modifiedCount === 1;
  }

  async delete(tokenHash: string): Promise<void> {
    await this.col.deleteOne({ tokenHash });
  }
}

export class MongoNonceStore implements NonceStore {
  private readonly col: Collection<NonceDoc>;

  constructor(db: Db) {
    this.col = db.collection<NonceDoc>(IDENTITY_COLLECTIONS.nonces);
  }

  async consume(nonce: string, expiresAt: Date): Promise<boolean> {
    try {
      await this.col.insertOne({ _id: nonce, expiresAt });
      return true;
    } catch (e) {
      if (typeof e === "object" && e !== null && "code" in e && e.code === 11000) return false;
      throw e;
    }
  }
}
