import "server-only";
import { ObjectId, type Db } from "mongodb";
import type { DataOwner } from "@/common/privacy/user-data";
import { GROUP_ID_PATTERN, type Group, type GroupMember } from "../domain/group";
import { GROUPS_COLLECTION, GROUPS_SCHEMA_VERSION, type GroupDoc } from "../groups.model";
import type { GroupsRepositoryPort } from "../groups.ports";

function toDomain(d: GroupDoc): Group {
  return {
    id: d._id.toHexString(),
    name: d.name,
    ownerUserId: d.ownerUserId,
    inviteToken: d.inviteToken,
    members: [...d.members]
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((m) => ({ userId: m.userId, accountId32: m.accountId32, joinedAt: m.joinedAt })),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/** An ObjectId for a well-formed id; null otherwise (looked up as "not found"). */
const oid = (id: string) => (GROUP_ID_PATTERN.test(id) ? new ObjectId(id) : null);

export class GroupsRepository implements GroupsRepositoryPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<GroupDoc>(GROUPS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ inviteToken: 1 }, { unique: true, name: "uniq_invite_token" }),
      col.createIndex({ "members.userId": 1 }, { name: "by_member" }),
    ]);
  }

  async create(input: {
    name: string;
    owner: GroupMember;
    inviteToken: string;
    now: Date;
  }): Promise<Group> {
    const doc: GroupDoc = {
      _id: new ObjectId(),
      name: input.name,
      ownerUserId: input.owner.userId,
      inviteToken: input.inviteToken,
      members: [input.owner],
      pairsRefreshedAt: {},
      createdAt: input.now,
      updatedAt: input.now,
      schemaVersion: GROUPS_SCHEMA_VERSION,
    };
    await (await this.col()).insertOne(doc);
    return toDomain(doc);
  }

  async findById(id: string): Promise<Group | null> {
    const _id = oid(id);
    if (!_id) return null;
    const doc = await (await this.col()).findOne({ _id });
    return doc ? toDomain(doc) : null;
  }

  async findByInviteToken(token: string): Promise<Group | null> {
    const doc = await (await this.col()).findOne({ inviteToken: token });
    return doc ? toDomain(doc) : null;
  }

  async listForUser(userId: string): Promise<Group[]> {
    const docs = await (
      await this.col()
    )
      .find({ "members.userId": userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return docs.map(toDomain);
  }

  async countForUser(userId: string): Promise<number> {
    return (await this.col()).countDocuments({ "members.userId": userId });
  }

  async addMember(
    id: string,
    member: GroupMember,
    maxMembers: number,
    now: Date,
  ): Promise<Group | null> {
    const _id = oid(id);
    if (!_id) return null;
    // Atomic: not already a member, and no member at index max-1 (so there's room).
    const doc = await (
      await this.col()
    ).findOneAndUpdate(
      {
        _id,
        "members.userId": { $ne: member.userId },
        [`members.${maxMembers - 1}`]: { $exists: false },
      },
      { $push: { members: member }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );
    return doc ? toDomain(doc) : null;
  }

  async removeMember(id: string, userId: string, now: Date): Promise<boolean> {
    const _id = oid(id);
    if (!_id) return false;
    const res = await (
      await this.col()
    ).updateOne(
      { _id, "members.userId": userId },
      { $pull: { members: { userId } }, $set: { updatedAt: now } },
    );
    return res.modifiedCount > 0;
  }

  async setOwner(id: string, userId: string, now: Date): Promise<void> {
    const _id = oid(id);
    if (!_id) return;
    await (
      await this.col()
    ).updateOne(
      { _id, "members.userId": userId },
      { $set: { ownerUserId: userId, updatedAt: now } },
    );
  }

  async rename(id: string, name: string, now: Date): Promise<void> {
    const _id = oid(id);
    if (!_id) return;
    await (await this.col()).updateOne({ _id }, { $set: { name, updatedAt: now } });
  }

  async setInviteToken(id: string, token: string, now: Date): Promise<void> {
    const _id = oid(id);
    if (!_id) return;
    await (await this.col()).updateOne({ _id }, { $set: { inviteToken: token, updatedAt: now } });
  }

  async delete(id: string): Promise<boolean> {
    const _id = oid(id);
    if (!_id) return false;
    return (await (await this.col()).deleteOne({ _id })).deletedCount > 0;
  }

  async pairsRefreshedAt(id: string): Promise<Record<string, Date>> {
    const _id = oid(id);
    if (!_id) return {};
    const doc = await (await this.col()).findOne({ _id }, { projection: { pairsRefreshedAt: 1 } });
    return doc?.pairsRefreshedAt ?? {};
  }

  async markPairsRefreshed(id: string, keys: readonly string[], at: Date): Promise<void> {
    const _id = oid(id);
    if (!_id || keys.length === 0) return;
    await (
      await this.col()
    ).updateOne(
      { _id },
      { $set: Object.fromEntries(keys.map((k) => [`pairsRefreshedAt.${k}`, at])) },
    );
  }

  /**
   * The groups you're in: name, your role, when you joined and how many members there are.
   * Other members' accounts and the invite link are left out (they aren't yours).
   */
  async exportForMember(owner: DataOwner): Promise<Record<string, unknown>[]> {
    const docs = await (await this.col()).find({ "members.userId": owner.userId }).toArray();
    return docs.map((d) => ({
      id: d._id.toHexString(),
      name: d.name,
      role: d.ownerUserId === owner.userId ? "owner" : "member",
      joinedAt: d.members.find((m) => m.userId === owner.userId)?.joinedAt ?? null,
      memberCount: d.members.length,
      createdAt: d.createdAt,
    }));
  }
}
