import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/modules/shared/infrastructure/user-data";
import { MATCH_COLLECTIONS } from "./mongo-match-repositories";

export async function exportUserData(db: Db, owner: DataOwner) {
  const [facts, sync] = await Promise.all([
    db
      .collection(MATCH_COLLECTIONS.facts)
      .find({ accountId32: owner.accountId32 })
      .sort({ startedAt: -1 })
      .toArray(),
    db.collection(MATCH_COLLECTIONS.syncState).find({ accountId32: owner.accountId32 }).toArray(),
  ]);
  return { matches: forExport(facts), matchSync: forExport(sync) };
}

/** Your imported matches (public data, re-imported if you sign in again). Shared match records stay. */
export async function deleteUserData(db: Db, owner: DataOwner) {
  const [facts, sync] = await Promise.all([
    db.collection(MATCH_COLLECTIONS.facts).deleteMany({ accountId32: owner.accountId32 }),
    db.collection(MATCH_COLLECTIONS.syncState).deleteMany({ accountId32: owner.accountId32 }),
  ]);
  return { matches: facts.deletedCount, matchSync: sync.deletedCount };
}
