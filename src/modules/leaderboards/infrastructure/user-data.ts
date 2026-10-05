import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/modules/shared/infrastructure/user-data";
import { LEADERBOARD_COLLECTIONS } from "./mongo-activity-repository";

export async function exportUserData(db: Db, owner: DataOwner) {
  const [attempts, streaks, drafts] = await Promise.all([
    db.collection(LEADERBOARD_COLLECTIONS.attempts).find({ userId: owner.userId }).toArray(),
    db
      .collection<{ _id: string }>(LEADERBOARD_COLLECTIONS.streaks)
      .find({ _id: owner.userId })
      .toArray(),
    db.collection(LEADERBOARD_COLLECTIONS.drafts).find({ userId: owner.userId }).toArray(),
  ]);
  return {
    challengeAttempts: forExport(attempts),
    challengeStreak: forExport(streaks),
    draftResults: forExport(drafts),
  };
}

export async function deleteUserData(db: Db, owner: DataOwner) {
  const [attempts, streaks, drafts] = await Promise.all([
    db.collection(LEADERBOARD_COLLECTIONS.attempts).deleteMany({ userId: owner.userId }),
    db
      .collection<{ _id: string }>(LEADERBOARD_COLLECTIONS.streaks)
      .deleteMany({ _id: owner.userId }),
    db.collection(LEADERBOARD_COLLECTIONS.drafts).deleteMany({ userId: owner.userId }),
  ]);
  return {
    challengeAttempts: attempts.deletedCount,
    challengeStreak: streaks.deletedCount,
    draftResults: drafts.deletedCount,
  };
}
