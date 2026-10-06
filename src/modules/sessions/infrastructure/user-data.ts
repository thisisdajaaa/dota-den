import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { SESSION_COLLECTIONS } from "./mongo-session-repositories";

export async function exportUserData(db: Db, owner: DataOwner) {
  const [notes, settings] = await Promise.all([
    db.collection(SESSION_COLLECTIONS.notes).find({ userId: owner.userId }).toArray(),
    db.collection(SESSION_COLLECTIONS.settings).find({ userId: owner.userId }).toArray(),
  ]);
  return { sessionNotes: forExport(notes), sessionSettings: forExport(settings) };
}

export async function deleteUserData(db: Db, owner: DataOwner) {
  const [notes, settings] = await Promise.all([
    db.collection(SESSION_COLLECTIONS.notes).deleteMany({ userId: owner.userId }),
    db.collection(SESSION_COLLECTIONS.settings).deleteMany({ userId: owner.userId }),
  ]);
  return { sessionNotes: notes.deletedCount, sessionSettings: settings.deletedCount };
}
