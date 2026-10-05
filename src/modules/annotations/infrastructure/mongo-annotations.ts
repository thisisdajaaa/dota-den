import type { Db } from "mongodb";
import type { DataOwner } from "@/modules/shared/infrastructure/user-data";
import { forExport } from "@/modules/shared/infrastructure/user-data";
import type { MatchAnnotation } from "../domain/annotation";

const COLLECTION = "match_annotations";

interface Doc extends MatchAnnotation {
  _id: string;
}

const id = (userId: string, matchId: string) => `${userId}:${matchId}`;

export async function ensureAnnotationIndexes(db: Db): Promise<void> {
  await db.collection(COLLECTION).createIndex({ userId: 1, tags: 1 }, { name: "by_user_tag" });
}

export async function getAnnotation(db: Db, userId: string, matchId: string) {
  const doc = await db.collection<Doc>(COLLECTION).findOne({ _id: id(userId, matchId) });
  if (!doc) return null;
  const { _id: _i, ...rest } = doc;
  return rest as MatchAnnotation;
}

/** Saves (or removes, when empty) your tags and note on a match. */
export async function saveAnnotation(db: Db, a: MatchAnnotation): Promise<void> {
  const col = db.collection<Doc>(COLLECTION);
  if (a.tags.length === 0 && a.note.trim() === "") {
    await col.deleteOne({ _id: id(a.userId, a.matchId) });
    return;
  }
  await col.updateOne({ _id: id(a.userId, a.matchId) }, { $set: a }, { upsert: true });
}

/** Your tags with how many matches carry each, most used first. */
export async function tagCounts(db: Db, userId: string) {
  return db
    .collection<Doc>(COLLECTION)
    .aggregate<{ tag: string; matches: number }>([
      { $match: { userId } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", matches: { $sum: 1 } } },
      { $sort: { matches: -1, _id: 1 } },
      { $limit: 30 },
      { $project: { _id: 0, tag: "$_id", matches: 1 } },
    ])
    .toArray();
}

export async function matchIdsWithTag(db: Db, userId: string, tag: string): Promise<string[]> {
  const docs = await db
    .collection<Doc>(COLLECTION)
    .find({ userId, tags: tag }, { projection: { matchId: 1 } })
    .limit(5_000)
    .toArray();
  return docs.map((d) => d.matchId);
}

export async function exportUserData(db: Db, owner: DataOwner) {
  const docs = await db.collection(COLLECTION).find({ userId: owner.userId }).toArray();
  return { matchNotes: forExport(docs) };
}

export async function deleteUserData(db: Db, owner: DataOwner) {
  const r = await db.collection(COLLECTION).deleteMany({ userId: owner.userId });
  return { matchNotes: r.deletedCount };
}
