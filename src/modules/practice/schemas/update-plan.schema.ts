import { z } from "zod";

/** Swap a step for another suggestion, or dismiss it for the week. */
export const UpdatePlanSchema = z.object({
  action: z.enum(["swap", "dismiss"]),
  stepId: z.string().trim().min(1).max(64),
});
