import type { Db } from "mongodb";
import type { ErrorEvent, ErrorGroup } from "../domain/error-event";

const COLLECTION = "error_events";
const RETENTION_S = 30 * 24 * 3600;

export async function ensureErrorIndexes(db: Db): Promise<void> {
  const col = db.collection(COLLECTION);
  await Promise.all([
    col.createIndex({ at: 1 }, { expireAfterSeconds: RETENTION_S, name: "ttl_30d" }),
    col.createIndex({ fingerprint: 1, at: -1 }, { name: "by_fingerprint" }),
  ]);
}

export async function insertErrorEvent(db: Db, event: ErrorEvent): Promise<void> {
  await db.collection<ErrorEvent>(COLLECTION).insertOne({ ...event });
}

/** Distinct errors since `since`, most recent first. */
export async function errorGroups(db: Db, since: Date, limit = 20): Promise<ErrorGroup[]> {
  return db
    .collection<ErrorEvent>(COLLECTION)
    .aggregate<ErrorGroup>([
      { $match: { at: { $gte: since } } },
      { $sort: { at: -1 } },
      {
        $group: {
          _id: "$fingerprint",
          source: { $first: "$source" },
          message: { $first: "$message" },
          route: { $first: "$route" },
          path: { $first: "$path" },
          count: { $sum: 1 },
          firstAt: { $last: "$at" },
          lastAt: { $first: "$at" },
        },
      },
      { $sort: { lastAt: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          fingerprint: "$_id",
          source: 1,
          message: 1,
          route: 1,
          path: 1,
          count: 1,
          firstAt: 1,
          lastAt: 1,
        },
      },
    ])
    .toArray();
}
