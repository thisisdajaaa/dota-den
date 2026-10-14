import type { PlanGap, PlanStep } from "./domain/practice-plan";

export const PRACTICE_PLANS_COLLECTION = "practice_plans";

/** One player's practice plan for one week. */
export interface PracticePlan {
  userId: string;
  /** First day of the week (YYYY-MM-DD, in the player's time zone). */
  week: string;
  steps: PlanStep[];
  alternates: PlanStep[];
  personal: boolean;
  gaps: PlanGap[];
  /** True once the player swapped or dismissed a step (the plan is then kept as is). */
  edited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Stored as `practice_plans`, one document per user and week. */
export interface PracticePlanDocument extends PracticePlan {
  /** `${userId}:${week}` */
  _id: string;
}

export const practicePlanId = (userId: string, week: string) => `${userId}:${week}`;
