import type { PlanGap, PlanStep, StepProgress } from "../../domain/practice-plan";

/** One step of the plan with where it stands this week. */
export interface PlanStepViewDto extends StepProgress {
  step: PlanStep;
  /** Another suggestion can replace this step. */
  canSwap: boolean;
}

/** The overview card and PATCH /api/v1/me/practice-plan. */
export interface PracticePlanViewDto {
  week: string;
  personal: boolean;
  gaps: PlanGap[];
  steps: PlanStepViewDto[];
}
