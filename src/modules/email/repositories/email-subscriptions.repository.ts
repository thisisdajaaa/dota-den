import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { EMAIL_COLLECTIONS, type EmailSubscriptionDocument } from "../email.model";
import type { EmailSubscription, EmailSubscriptionsPort } from "../email.ports";

export class EmailSubscriptionsRepository implements EmailSubscriptionsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<EmailSubscriptionDocument>(
      EMAIL_COLLECTIONS.subscriptions,
    );
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex(
      { confirmTokenHash: 1 },
      {
        name: "by_confirm_token",
        unique: true,
        partialFilterExpression: { confirmTokenHash: { $type: "string" } },
      },
    );
    await col.createIndex({ status: 1 }, { name: "by_status" });
  }

  async get(userId: string): Promise<EmailSubscription | null> {
    const doc = await (await this.col()).findOne({ _id: userId });
    return doc
      ? {
          userId: doc._id,
          email: doc.email,
          status: doc.status,
          confirmSends: doc.confirmSends ?? [],
          unsubscribeNonce: doc.unsubscribeNonce,
        }
      : null;
  }

  async startConfirmation(
    userId: string,
    email: string,
    token: { hash: string; expiresAt: Date },
    sends: Date[],
    now: Date,
  ): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: userId },
      {
        $set: {
          email,
          status: "pending",
          confirmTokenHash: token.hash,
          confirmExpiresAt: token.expiresAt,
          confirmSends: sends,
          unsubscribeNonce: null,
          updatedAt: now,
          confirmedAt: null,
          unsubscribedAt: null,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  async confirm(tokenHash: string, nonce: string, now: Date) {
    const doc = await (
      await this.col()
    ).findOneAndUpdate(
      { confirmTokenHash: tokenHash, status: "pending", confirmExpiresAt: { $gt: now } },
      {
        $set: {
          status: "confirmed",
          confirmTokenHash: null,
          confirmExpiresAt: null,
          unsubscribeNonce: nonce,
          confirmedAt: now,
          updatedAt: now,
        },
      },
    );
    return doc ? { userId: doc._id } : null;
  }

  async unsubscribe(userId: string, nonce: string, now: Date): Promise<boolean> {
    const res = await (
      await this.col()
    ).updateOne(
      { _id: userId, status: "confirmed", unsubscribeNonce: nonce },
      {
        $set: {
          status: "unsubscribed",
          unsubscribeNonce: null,
          unsubscribedAt: now,
          updatedAt: now,
        },
      },
    );
    return res.modifiedCount > 0;
  }

  async remove(userId: string): Promise<boolean> {
    return (await (await this.col()).deleteOne({ _id: userId })).deletedCount > 0;
  }

  async confirmed() {
    const docs = await (
      await this.col()
    )
      .find({ status: "confirmed" }, { projection: { email: 1, unsubscribeNonce: 1 } })
      .toArray();
    return docs
      .filter((d) => d.unsubscribeNonce)
      .map((d) => ({ userId: d._id, email: d.email, unsubscribeNonce: d.unsubscribeNonce! }));
  }

  /** Exported without the token hash and unsubscribe nonce (they're link secrets). */
  async exportForOwner(owner: DataOwner) {
    const docs = await (
      await this.col()
    )
      .find({ _id: owner.userId }, { projection: { confirmTokenHash: 0, unsubscribeNonce: 0 } })
      .toArray();
    return forExport(docs);
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ _id: owner.userId })).deletedCount;
  }
}
