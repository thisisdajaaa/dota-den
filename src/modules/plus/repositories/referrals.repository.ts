import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { PlusGrant, Referral } from "../domain/referral";
import {
  PLUS_COLLECTIONS,
  PLUS_SCHEMA_VERSION,
  type GrantDocument,
  type ReferralCodeDocument,
  type ReferralDocument,
} from "../plus.model";
import type { GrantsPort, ReferralsPort } from "../plus.ports";

const friendKey = (accountId32: number) => `steam:${accountId32}`;
const isDuplicate = (error: unknown) => (error as { code?: number }).code === 11000;

const toReferral = ({ _id: _, schemaVersion: __, ...r }: ReferralDocument): Referral => r;

/** Invite codes and friends' claims (ADR 0013, "Referrals"). */
export class ReferralsRepository implements ReferralsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async codes() {
    return (await this.getDb()).collection<ReferralCodeDocument>(PLUS_COLLECTIONS.referralCodes);
  }

  private async claims() {
    return (await this.getDb()).collection<ReferralDocument>(PLUS_COLLECTIONS.referrals);
  }

  async ensureIndexes(): Promise<void> {
    await (await this.codes()).createIndex({ userId: 1 }, { name: "by_user", unique: true });
    const claims = await this.claims();
    await claims.createIndex({ referrerId: 1, claimedAt: -1 }, { name: "by_referrer" });
    await claims.createIndex({ friendUserId: 1 }, { name: "by_friend_user" });
  }

  async codeOf(userId: string) {
    return (await (await this.codes()).findOne({ userId }))?._id ?? null;
  }

  async saveCode(c: { code: string; userId: string; accountId32: number; createdAt: Date }) {
    try {
      await (
        await this.codes()
      ).insertOne({
        _id: c.code,
        userId: c.userId,
        accountId32: c.accountId32,
        createdAt: c.createdAt,
        schemaVersion: PLUS_SCHEMA_VERSION,
      });
      return true;
    } catch (error) {
      if (isDuplicate(error)) return false;
      throw error;
    }
  }

  async ownerOf(code: string) {
    const doc = await (await this.codes()).findOne({ _id: code });
    return doc ? { userId: doc.userId, accountId32: doc.accountId32 } : null;
  }

  async claimOf(friendAccountId32: number, friendUserId?: string) {
    const doc = await (
      await this.claims()
    ).findOne(
      friendUserId === undefined
        ? { _id: friendKey(friendAccountId32) }
        : { $or: [{ _id: friendKey(friendAccountId32) }, { friendUserId }] },
    );
    return doc ? toReferral(doc) : null;
  }

  async claim(referral: Referral) {
    try {
      await (
        await this.claims()
      ).insertOne({
        _id: friendKey(referral.friendAccountId32),
        ...referral,
        schemaVersion: PLUS_SCHEMA_VERSION,
      });
      return true;
    } catch (error) {
      if (isDuplicate(error)) return false;
      throw error;
    }
  }

  async byReferrer(referrerId: string) {
    const docs = await (
      await this.claims()
    )
      .find({ referrerId })
      .sort({ claimedAt: -1 })
      .limit(500)
      .toArray();
    return docs.map(toReferral);
  }

  async settle(
    friendAccountId32: number,
    update: { status: "rewarded" | "expired"; rewardedAt: Date | null; referrerRewarded: boolean },
  ) {
    const res = await (
      await this.claims()
    ).updateOne({ _id: friendKey(friendAccountId32), status: "pending" }, { $set: update });
    return res.modifiedCount === 1;
  }

  async counts() {
    const claims = await this.claims();
    const [claimed, pending, rewarded] = await Promise.all([
      claims.estimatedDocumentCount(),
      claims.countDocuments({ status: "pending" }),
      claims.countDocuments({ status: "rewarded" }),
    ]);
    return { claimed, pending, rewarded };
  }

  async exportForOwner(owner: DataOwner) {
    const [codes, claims] = await Promise.all([
      (await this.codes()).find({ userId: owner.userId }).toArray(),
      (await this.claims())
        .find({ $or: [{ friendUserId: owner.userId }, { referrerId: owner.userId }] })
        .toArray(),
    ]);
    return [...forExport(codes), ...forExport(claims)];
  }

  async deleteForOwner(owner: DataOwner) {
    const [codes, claims] = await Promise.all([
      (await this.codes()).deleteMany({ userId: owner.userId }),
      (await this.claims()).deleteMany({
        $or: [{ friendUserId: owner.userId }, { referrerId: owner.userId }],
      }),
    ]);
    return codes.deletedCount + claims.deletedCount;
  }
}

const toGrant = ({ _id, schemaVersion: _, ...g }: GrantDocument): PlusGrant => ({ id: _id, ...g });

/** Weeks of Plus given inside the app. */
export class GrantsRepository implements GrantsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<GrantDocument>(PLUS_COLLECTIONS.grants);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex({ userId: 1 }, { name: "by_user" });
    await col.createIndex({ endsAt: 1 }, { name: "by_ends_at" });
  }

  async forUser(userId: string) {
    const docs = await (await this.col()).find({ userId }).limit(100).toArray();
    return docs.map(toGrant);
  }

  async give(grant: PlusGrant) {
    const { id, ...rest } = grant;
    try {
      await (await this.col()).insertOne({ _id: id, ...rest, schemaVersion: PLUS_SCHEMA_VERSION });
      return true;
    } catch (error) {
      if (isDuplicate(error)) return false;
      throw error;
    }
  }

  async activeUserIds(now: Date) {
    const docs = await (
      await this.col()
    )
      .find({ startsAt: { $lte: now }, endsAt: { $gt: now } }, { projection: { userId: 1 } })
      .limit(100_000)
      .toArray();
    return [...new Set(docs.map((d) => d.userId))];
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner) {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
