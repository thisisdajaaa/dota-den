import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/modules/shared/infrastructure/user-data";
import { TOGETHER_COLLECTIONS } from "./mongo-together-repository";

export async function exportUserData(db: Db, owner: DataOwner) {
  const pairs = await db
    .collection(TOGETHER_COLLECTIONS.matches)
    .find({ $or: [{ accountIdA: owner.accountId32 }, { accountIdB: owner.accountId32 }] })
    .toArray();
  return { gamesWithFriends: forExport(pairs) };
}

export async function deleteUserData(db: Db, owner: DataOwner) {
  const r = await db
    .collection(TOGETHER_COLLECTIONS.matches)
    .deleteMany({ $or: [{ accountIdA: owner.accountId32 }, { accountIdB: owner.accountId32 }] });
  return { gamesWithFriends: r.deletedCount };
}
