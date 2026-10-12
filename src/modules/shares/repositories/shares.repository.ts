import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { SHARES_COLLECTION, type ShareDocument } from "../shares.model";
import type { SharesRepositoryPort } from "../shares.ports";

export class SharesRepository implements SharesRepositoryPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<ShareDocument>(SHARES_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ userId: 1, kind: 1, ref: 1 }, { unique: true, name: "uniq_user_thing" });
  }

  async upsert(
    input: Omit<ShareDocument, "_id" | "createdAt" | "updatedAt">,
    slug: string,
    now: Date,
  ): Promise<ShareDocument> {
    const doc = await (
      await this.col()
    ).findOneAndUpdate(
      { userId: input.userId, kind: input.kind, ref: input.ref },
      {
        $set: { snapshot: input.snapshot, playerName: input.playerName, updatedAt: now },
        $setOnInsert: {
          _id: slug,
          userId: input.userId,
          kind: input.kind,
          ref: input.ref,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!doc) throw new Error("Share upsert returned no document");
    return doc;
  }

  async find(slug: string): Promise<ShareDocument | null> {
    return (await this.col()).findOne({ _id: slug });
  }

  async listForUser(userId: string): Promise<ShareDocument[]> {
    return (await this.col()).find({ userId }).sort({ updatedAt: -1 }).toArray();
  }

  async remove(userId: string, slug: string): Promise<boolean> {
    return (await (await this.col()).deleteOne({ _id: slug, userId })).deletedCount > 0;
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
