import type { ChallengeAttempt, DraftResult } from "./domain/activity";

export const LEADERBOARDS_SCHEMA_VERSION = 1;

export const LEADERBOARD_COLLECTIONS = {
  attempts: "challenge_attempts",
  streaks: "challenge_streaks",
  drafts: "draft_results",
} as const;

export interface AttemptDoc extends ChallengeAttempt {
  /** `user:type:seed`, so uniqueness holds even before `ensureLeaderboardIndexes` runs. */
  _id: string;
  schemaVersion: number;
}

export interface StreakDoc {
  /** The user id: one streak per player. */
  _id: string;
  schemaVersion: number;
  current: number;
  best: number;
  updatedAt: Date;
}

export interface DraftDoc extends DraftResult {
  /** `user:snapshotHash`, so uniqueness holds even before `ensureLeaderboardIndexes` runs. */
  _id: string;
  schemaVersion: number;
}
