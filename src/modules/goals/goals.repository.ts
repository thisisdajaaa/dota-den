import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { Goal } from "./domain/goals";
import { GOALS_COLLECTION, weeklyGoalsId, type WeeklyGoalsDocument } from "./goals.model";
import type { GoalsRepositoryPort } from "./goals.ports";

export class GoalsRepository implements GoalsRepositoryPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<WeeklyGoalsDocument>(GOALS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await (await this.col()).createIndex({ userId: 1, week: -1 }, { name: "by_user_week" });
  }

  async findGoals(userId: string, week: string): Promise<Goal[]> {
    const doc = await (await this.col()).findOne({ _id: weeklyGoalsId(userId, week) });
    return doc?.goals ?? [];
  }

  async saveGoals(userId: string, week: string, goals: Goal[]): Promise<void> {
    const col = await this.col();
    const _id = weeklyGoalsId(userId, week);
    if (goals.length === 0) {
      await col.deleteOne({ _id });
      return;
    }
    await col.updateOne(
      { _id },
      { $set: { userId, week, goals, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
