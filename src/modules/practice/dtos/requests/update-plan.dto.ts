import type { z } from "zod";
import type { UpdatePlanSchema } from "../../schemas/update-plan.schema";

export type UpdatePlanDto = z.infer<typeof UpdatePlanSchema>;
