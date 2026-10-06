import type { Goal } from "./domain/goals";

export const GOALS_COLLECTION = "weekly_goals";

/** One player's goals for one week. */
export interface WeeklyGoals {
  userId: string;
  /** First day of the week (YYYY-MM-DD, in the player's time zone). */
  week: string;
  goals: Goal[];
  updatedAt: Date;
}

/** Stored as `weekly_goals`, one document per user and week. */
export interface WeeklyGoalsDocument extends WeeklyGoals {
  /** `${userId}:${week}` */
  _id: string;
}

export const weeklyGoalsId = (userId: string, week: string) => `${userId}:${week}`;
