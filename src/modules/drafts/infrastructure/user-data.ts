import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { DRAFT_HISTORY_COLLECTION } from "./mongo-draft-history";

export async function exportUserData(db: Db, owner: DataOwner) {
  const history = await db
    .collection(DRAFT_HISTORY_COLLECTION)
    .find({ captainUserIds: owner.userId })
    .toArray();
  return { friendRoomDrafts: forExport(history) };
}

/**
 * Friend-room drafts are shared with the other captain, so they stay in their history: only
 * this player's name, picture and ids are removed.
 */
export async function deleteUserData(db: Db, owner: DataOwner) {
  const col = db.collection(DRAFT_HISTORY_COLLECTION);
  let anonymised = 0;
  for (const side of ["radiant", "dire"] as const) {
    const r = await col.updateMany({ [`captains.${side}.userId`]: owner.userId }, {
      $set: {
        [`captains.${side}.userId`]: "deleted",
        [`captains.${side}.accountId32`]: 0,
        [`captains.${side}.name`]: "Deleted player",
        [`captains.${side}.avatarUrl`]: null,
      },
      $pull: { captainUserIds: owner.userId, captainAccountIds: owner.accountId32 },
    } as never);
    anonymised += r.modifiedCount;
  }
  return { friendRoomDraftsAnonymised: anonymised };
}
