import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { PATCH_COLLECTIONS } from "./mongo-patch-repositories";

export async function exportUserData(db: Db, owner: DataOwner) {
  const w = await db
    .collection(PATCH_COLLECTIONS.watchlists)
    .find({ userId: owner.userId })
    .toArray();
  return { patchWatchlist: forExport(w) };
}

export async function deleteUserData(db: Db, owner: DataOwner) {
  const r = await db.collection(PATCH_COLLECTIONS.watchlists).deleteMany({ userId: owner.userId });
  return { patchWatchlist: r.deletedCount };
}
