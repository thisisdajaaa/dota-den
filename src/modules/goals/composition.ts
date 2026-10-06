import "server-only";
import { getDb } from "@/common/db/mongo";
import type { DataOwner } from "@/common/privacy/user-data";
import type { Goal } from "./domain/goals";
import * as store from "./infrastructure/mongo-goals";

export async function getWeekGoals(userId: string, week: string) {
  return store.getGoals(await getDb(), userId, week);
}

export async function saveWeekGoals(userId: string, week: string, goals: Goal[]) {
  return store.saveGoals(await getDb(), userId, week, goals);
}

export async function exportMyData(owner: DataOwner) {
  return store.exportUserData(await getDb(), owner);
}

export async function deleteMyData(owner: DataOwner) {
  return store.deleteUserData(await getDb(), owner);
}
