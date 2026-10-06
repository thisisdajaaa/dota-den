import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { PLAYER_COLLECTIONS } from "./mongo-follow-repository";

export async function exportUserData(db: Db, owner: DataOwner) {
  const follows = await db
    .collection(PLAYER_COLLECTIONS.follows)
    .find({ userId: owner.userId })
    .toArray();
  return { trackedPlayers: forExport(follows) };
}

export async function deleteUserData(db: Db, owner: DataOwner) {
  const r = await db.collection(PLAYER_COLLECTIONS.follows).deleteMany({ userId: owner.userId });
  return { trackedPlayers: r.deletedCount };
}
