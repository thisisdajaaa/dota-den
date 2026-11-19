import type { HeroInfo } from "@/modules/matches/domain/read-models";
import type { StackPlan } from "../../domain/stack-planner";

/** Tonight's lineup. Hero options are Plus: empty for free players (`heroesLocked`). */
export interface StackPlanDto extends StackPlan {
  heroesLocked: boolean;
  /** The heroes named in the plan. */
  heroInfo: Record<number, HeroInfo>;
}

/** What the planner card needs before a plan is asked for. */
export interface PlannerContextDto {
  /** Ticked at first: you, plus members your "Friends playing now" shows in Dota. */
  defaultIn: number[];
  /** Members ticked because they're in Dota right now. */
  playing: number[];
  plus: boolean;
  /** Your Discord channel (Plus), when a webhook is saved. */
  discord: { name: string | null } | null;
}
