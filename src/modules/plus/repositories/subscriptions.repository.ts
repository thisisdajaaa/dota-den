import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { POSSIBLY_ENTITLED } from "../domain/entitlement";
import {
  subscriptionKey,
  type BillingProviderName,
  type Subscription,
  type SubscriptionStatus,
} from "../domain/subscription";
import { PLUS_COLLECTIONS, PLUS_SCHEMA_VERSION, type SubscriptionDocument } from "../plus.model";
import type { SubscriptionsPort, UpsertOutcome } from "../plus.ports";

const toSubscription = ({
  _id: _,
  schemaVersion: _v,
  ...d
}: SubscriptionDocument): Subscription => ({
  ...d,
});

/** Plus subscriptions, one document per provider subscription. */
export class SubscriptionsRepository implements SubscriptionsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<SubscriptionDocument>(PLUS_COLLECTIONS.subscriptions);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex({ userId: 1 }, { name: "by_user" });
    // Badges: entitled accounts among a page of players.
    await col.createIndex({ accountId32: 1, status: 1 }, { name: "by_account_status" });
    // Go-live alerts and the admin counts.
    await col.createIndex({ status: 1 }, { name: "by_status" });
  }

  async find(provider: BillingProviderName, subscriptionId: string) {
    const doc = await (
      await this.col()
    ).findOne({ _id: subscriptionKey(provider, subscriptionId) });
    return doc ? toSubscription(doc) : null;
  }

  async upsertIfNewer(sub: Subscription): Promise<UpsertOutcome> {
    const _id = subscriptionKey(sub.provider, sub.subscriptionId);
    const { createdAt, ...rest } = sub;
    const col = await this.col();
    const filter = { _id, providerUpdatedAt: { $lte: sub.providerUpdatedAt } };
    const update = {
      $set: { ...rest, schemaVersion: PLUS_SCHEMA_VERSION },
      $setOnInsert: { createdAt },
    };
    try {
      // Matches only when nothing newer is stored; otherwise the upsert's insert hits the
      // existing _id and fails.
      const res = await col.updateOne(filter, update, { upsert: true });
      return res.upsertedCount === 1 ? "inserted" : "updated";
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      // Either something newer is stored, or a concurrent first delivery inserted it a moment
      // ago: one more conditional update tells them apart.
      const again = await col.updateOne(filter, { $set: update.$set });
      return again.matchedCount === 1 ? "updated" : "stale";
    }
  }

  async forUser(userId: string) {
    const docs = await (await this.col()).find({ userId }).limit(50).toArray();
    return docs.map(toSubscription);
  }

  async possiblyEntitledForAccounts(accountIds: readonly number[]) {
    if (accountIds.length === 0) return [];
    const docs = await (
      await this.col()
    )
      .find({
        accountId32: { $in: [...new Set(accountIds)] },
        status: { $in: [...POSSIBLY_ENTITLED] },
      })
      .toArray();
    return docs.map(toSubscription);
  }

  async possiblyEntitled() {
    const docs = await (
      await this.col()
    )
      .find({ status: { $in: [...POSSIBLY_ENTITLED] }, userId: { $ne: null } })
      .limit(100_000)
      .toArray();
    return docs.map(toSubscription);
  }

  async countsByStatus(testMode: boolean | null) {
    const rows = await (
      await this.col()
    )
      .aggregate<{ _id: { status: SubscriptionStatus; linked: boolean }; count: number }>([
        // Production and staging share the database: count only this deployment's mode.
        ...(testMode === null ? [] : [{ $match: { testMode } }]),
        {
          $group: {
            _id: { status: "$status", linked: { $ne: ["$userId", null] } },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();
    return rows.map((r) => ({ status: r._id.status, linked: r._id.linked, count: r.count }));
  }

  /** Exported without the pre-signed portal link (a short-lived credential). */
  async exportForOwner(owner: DataOwner) {
    const docs = await (
      await this.col()
    )
      .find({ userId: owner.userId }, { projection: { portalUrl: 0, portalUrlAt: 0 } })
      .toArray();
    return forExport(docs);
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
