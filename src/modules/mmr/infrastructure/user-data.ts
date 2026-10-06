import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { MEDAL_COLLECTION as MEDALS } from "./mongo-medal-history";
import { MMR_COLLECTIONS } from "./mongo-mmr-repository";

export async function exportUserData(db: Db, owner: DataOwner) {
  const [entries, medals] = await Promise.all([
    db
      .collection(MMR_COLLECTIONS.entries)
      .find({ userId: owner.userId })
      .sort({ observedAt: 1 })
      .toArray(),
    db
      .collection(MEDALS)
      .find({ accountId32: owner.accountId32 })
      .sort({ observedAt: 1 })
      .toArray(),
  ]);
  return { mmrEntries: forExport(entries), medalHistory: forExport(medals) };
}

export async function deleteUserData(db: Db, owner: DataOwner) {
  const [entries, medals] = await Promise.all([
    db.collection(MMR_COLLECTIONS.entries).deleteMany({ userId: owner.userId }),
    db.collection(MEDALS).deleteMany({ accountId32: owner.accountId32 }),
  ]);
  return { mmrEntries: entries.deletedCount, medalHistory: medals.deletedCount };
}
