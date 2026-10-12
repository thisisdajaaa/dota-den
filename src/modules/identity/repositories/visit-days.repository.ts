import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { IDENTITY_COLLECTIONS, type VisitDayDocument } from "../identity.model";

/** One document per player per (UTC) day they opened the app: for retention numbers. */
export class VisitDaysRepository {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<VisitDayDocument>(IDENTITY_COLLECTIONS.visitDays);
  }

  async ensureIndexes(): Promise<void> {
    await (await this.col()).createIndex({ userId: 1, day: 1 }, { name: "by_user_day" });
  }

  async record(userId: string, day: string, at: Date): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: `${userId}:${day}` },
      { $setOnInsert: { userId, day, firstAt: at } },
      { upsert: true },
    );
  }

  /** Days each player visited, oldest first. */
  async daysByUser(userIds: readonly string[]): Promise<Map<string, string[]>> {
    const docs = await (
      await this.col()
    )
      .find({ userId: { $in: [...userIds] } }, { projection: { userId: 1, day: 1 } })
      .sort({ day: 1 })
      .toArray();
    const out = new Map<string, string[]>();
    for (const d of docs) out.set(d.userId, [...(out.get(d.userId) ?? []), d.day]);
    return out;
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
