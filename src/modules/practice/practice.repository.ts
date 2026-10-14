import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import {
  PRACTICE_PLANS_COLLECTION,
  practicePlanId,
  type PracticePlan,
  type PracticePlanDocument,
} from "./practice.model";
import type { PracticeRepositoryPort } from "./practice.ports";

const strip = ({ _id: _, ...plan }: PracticePlanDocument): PracticePlan => plan;

export class PracticeRepository implements PracticeRepositoryPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<PracticePlanDocument>(PRACTICE_PLANS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await (await this.col()).createIndex({ userId: 1, week: -1 }, { name: "by_user_week" });
  }

  async find(userId: string, week: string): Promise<PracticePlan | null> {
    const doc = await (await this.col()).findOne({ _id: practicePlanId(userId, week) });
    return doc ? strip(doc) : null;
  }

  async insertIfAbsent(plan: PracticePlan): Promise<PracticePlan> {
    const col = await this.col();
    const _id = practicePlanId(plan.userId, plan.week);
    // Two first views at once both build a plan; the first stored one wins.
    const doc = await col.findOneAndUpdate(
      { _id },
      { $setOnInsert: plan },
      { upsert: true, returnDocument: "after" },
    );
    return doc ? strip(doc) : plan;
  }

  async save(plan: PracticePlan): Promise<void> {
    const _id = practicePlanId(plan.userId, plan.week);
    await (await this.col()).replaceOne({ _id }, plan, { upsert: true });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
