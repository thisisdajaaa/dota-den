import type { DraftGrade } from "./draft-score";

/**
 * What signed-in players did on Dota Den, as recorded for the leaderboards. Pure types and
 * rules only: the draft and challenge rules themselves live in the drafts context.
 */

export type ActivitySide = "radiant" | "dire";

/** Challenge grades, as the drafts context reports them. */
export const CHALLENGE_GRADES = ["excellent", "good", "playable", "risky"] as const;
export type ChallengeGrade = (typeof CHALLENGE_GRADES)[number];

/** Good or better counts as a correct answer and keeps a streak going (same rule as the client). */
export function isCorrectGrade(grade: ChallengeGrade): boolean {
  return grade === "excellent" || grade === "good";
}

/** One answer to one puzzle. Only the first answer to a puzzle (type + seed) is kept. */
export interface ChallengeAttempt {
  userId: string;
  type: string;
  seed: string;
  grade: ChallengeGrade;
  correct: boolean;
  at: Date;
}

export interface ChallengeStreak {
  current: number;
  best: number;
}

export const NO_STREAK: ChallengeStreak = { current: 0, best: 0 };

/** A correct first answer extends the streak; anything else resets it to zero. */
export function nextStreak(streak: ChallengeStreak, correct: boolean): ChallengeStreak {
  const current = correct ? streak.current + 1 : 0;
  return { current, best: Math.max(streak.best, current) };
}

/** Best run of correct answers in order (the streak rule applied to a whole sequence). */
export function bestStreakOf(correctInOrder: readonly boolean[]): number {
  return correctInOrder.reduce((s, c) => nextStreak(s, c), NO_STREAK).best;
}

/** `ai`: against the AI captain. `practice`: you drafted both sides. */
export type DraftMode = "ai" | "practice";

/** A completed draft practice (not a room draft: those live in the drafts context's history). */
export interface DraftResult {
  userId: string;
  mode: DraftMode;
  /** The side you drafted; null in practice, where you drafted both. */
  side: ActivitySide | null;
  /** 0–100 draft score for your side, or null when there is no side or no estimate. */
  score: number | null;
  /** The draft report card grade for your side, when the score came from the report. */
  grade: DraftGrade | null;
  /** Hash of the finished draft, so the same draft is only counted once per player. */
  snapshotHash: string;
  rulesetId: string;
  rulesetVersion: number;
  completedAt: Date;
}
