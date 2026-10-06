import type { Goal, GoalProgress } from "../../domain/goals";

/** PUT /api/v1/me/goals */
export interface SavedGoalsDto {
  week: string;
  goals: Goal[];
}

/** The overview card: this week's goals with progress, and how last week's ended. */
export interface WeeklyGoalsViewDto {
  week: string;
  daysLeft: number;
  thisWeek: Array<Pick<GoalProgress, "goal" | "current" | "met" | "fraction">>;
  lastWeek: Array<{ goal: Goal; met: boolean }>;
}
