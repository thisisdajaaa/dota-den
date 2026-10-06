import type { Db } from "mongodb";
import type { DataOwner } from "@/modules/shared/infrastructure/user-data";
import { forExport } from "@/modules/shared/infrastructure/user-data";
import type { Goal } from "../domain/goals";

const COLLECTION = "weekly_goals";

interface Doc {
  _id: string;
  userId: string;
  /** First day of the week (YYYY-MM-DD, in the player's time zone). */
  week: string;
  goals: Goal[];
  updatedAt: Date;
}

export async function ensureGoalIndexes(db: Db): Promise<void> {
  await db.collection(COLLECTION).createIndex({ userId: 1, week: -1 }, { name: "by_user_week" });
}

const id = (userId: string, week: string) => `${userId}:${week}`;

export async function getGoals(db: Db, userId: string, week: string): Promise<Goal[]> {
  const doc = await db.collection<Doc>(COLLECTION).findOne({ _id: id(userId, week) });
  return doc?.goals ?? [];
}

/** Saves (or removes, when empty) your goals for a week. */
export async function saveGoals(db: Db, userId: string, week: string, goals: Goal[]) {
  const col = db.collection<Doc>(COLLECTION);
  if (goals.length === 0) {
    await col.deleteOne({ _id: id(userId, week) });
    return;
  }
  await col.updateOne(
    { _id: id(userId, week) },
    { $set: { userId, week, goals, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function exportUserData(db: Db, owner: DataOwner) {
  const docs = await db.collection(COLLECTION).find({ userId: owner.userId }).toArray();
  return { weeklyGoals: forExport(docs) };
}

export async function deleteUserData(db: Db, owner: DataOwner) {
  const r = await db.collection(COLLECTION).deleteMany({ userId: owner.userId });
  return { weeklyGoals: r.deletedCount };
}
