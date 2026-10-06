import { type ActivitySide, type ChallengeStreak, type DraftMode } from "../../domain/activity";
import { type DraftGrade } from "../../domain/draft-score";
import type { RefereeError } from "../../leaderboards.ports";

export interface ChallengeRecord {
  /** False when the player had already answered this puzzle: nothing changed. */
  counted: boolean;
  streak: ChallengeStreak;
}

export type DraftRecordError = RefereeError | { type: "not_completed" };

export interface DraftRecord {
  /** False when this player already submitted the same finished draft. */
  counted: boolean;
  mode: DraftMode;
  side: ActivitySide | null;
  score: number | null;
  grade: DraftGrade | null;
}

export interface Viewer {
  userId: string;
  accountId32: number;
}
