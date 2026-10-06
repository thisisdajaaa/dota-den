import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { ObjectId } from "mongodb";
import { IDENTITY_COLLECTIONS } from "./mongo-identity-repositories";

/** Your account (no session tokens). */
export async function exportUserData(db: Db, owner: DataOwner) {
  const users = ObjectId.isValid(owner.userId)
    ? await db
        .collection(IDENTITY_COLLECTIONS.users)
        .find({ _id: new ObjectId(owner.userId) })
        .toArray()
    : [];
  return { account: forExport(users) };
}

/** Removes the account and every sign-in session. Run last: it signs the player out. */
export async function deleteUserData(db: Db, owner: DataOwner) {
  const sessions = await db
    .collection(IDENTITY_COLLECTIONS.sessions)
    .deleteMany({ userId: owner.userId });
  const users = ObjectId.isValid(owner.userId)
    ? await db.collection(IDENTITY_COLLECTIONS.users).deleteOne({ _id: new ObjectId(owner.userId) })
    : { deletedCount: 0 };
  return { account: users.deletedCount, sessions: sessions.deletedCount };
}
