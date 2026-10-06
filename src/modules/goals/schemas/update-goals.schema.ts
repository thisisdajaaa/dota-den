import { z } from "zod";
import { MAX_CUSTOM_LENGTH, MAX_GOALS } from "../domain/goals";

export const GoalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("winRate"), target: z.number().int().min(40).max(80) }),
  z.object({ type: z.literal("maxPerSession"), target: z.number().int().min(1).max(10) }),
  z.object({ type: z.literal("logAfterSessions") }),
  z.object({
    type: z.literal("heroGames"),
    heroId: z.number().int().min(1).max(1000),
    target: z.number().int().min(1).max(30),
  }),
  z.object({
    type: z.literal("custom"),
    text: z.string().trim().min(1).max(MAX_CUSTOM_LENGTH),
    done: z.boolean(),
  }),
]);

export const UpdateGoalsSchema = z.object({ goals: z.array(GoalSchema).max(MAX_GOALS) });
