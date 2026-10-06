import "server-only";
import { getDb } from "@/common/db/mongo";
import type { DataOwner } from "@/common/privacy/user-data";
import type { MatchAnnotation } from "./domain/annotation";
import * as store from "./infrastructure/mongo-annotations";

export async function getMatchAnnotation(userId: string, matchId: string) {
  return store.getAnnotation(await getDb(), userId, matchId);
}

export async function saveMatchAnnotation(a: MatchAnnotation) {
  return store.saveAnnotation(await getDb(), a);
}

export async function getTagCounts(userId: string) {
  return store.tagCounts(await getDb(), userId);
}

export async function getMatchIdsWithTag(userId: string, tag: string) {
  return store.matchIdsWithTag(await getDb(), userId, tag);
}

export async function exportMyData(owner: DataOwner) {
  return store.exportUserData(await getDb(), owner);
}

export async function deleteMyData(owner: DataOwner) {
  return store.deleteUserData(await getDb(), owner);
}
