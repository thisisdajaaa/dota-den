import type { Db } from "mongodb";
import { shouldRecord, type MedalSnapshot } from "../domain/medal-history";

export const MEDAL_COLLECTION = "rank_history";
const COLLECTION = MEDAL_COLLECTION;

interface MedalDoc extends MedalSnapshot {
  accountId32: number;
  lastSeenAt: Date;
}

export async function ensureMedalHistoryIndexes(db: Db): Promise<void> {
  await db
    .collection(COLLECTION)
    .createIndex({ accountId32: 1, observedAt: -1 }, { name: "by_account_time" });
}

/**
 * Note a sighting of the player's medal: a new row when it changed, otherwise just bump the
 * latest row's lastSeenAt (so a change can be dated between two sightings).
 */
export async function recordMedalSighting(
  db: Db,
  accountId32: number,
  rankTier: number | null,
  now: Date,
): Promise<void> {
  const col = db.collection<MedalDoc>(COLLECTION);
  const last = await col.findOne({ accountId32 }, { sort: { observedAt: -1 } });
  if (shouldRecord(last, rankTier)) {
    await col.insertOne({ accountId32, rankTier: rankTier!, observedAt: now, lastSeenAt: now });
  } else if (last && last.rankTier === rankTier) {
    await col.updateOne({ _id: last._id }, { $set: { lastSeenAt: now } });
  }
}

export async function medalHistory(db: Db, accountId32: number): Promise<MedalDoc[]> {
  const rows = await db
    .collection<MedalDoc>(COLLECTION)
    .find({ accountId32 }, { projection: { _id: 0 } })
    .sort({ observedAt: 1 })
    .limit(500)
    .toArray();
  // Two page loads at the same moment can both add the same medal; merge such repeats.
  const out: MedalDoc[] = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last && last.rankTier === r.rankTier) {
      if (r.lastSeenAt > last.lastSeenAt) last.lastSeenAt = r.lastSeenAt;
    } else out.push(r);
  }
  return out;
}
