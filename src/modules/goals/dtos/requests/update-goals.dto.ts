import type { z } from "zod";
import type { UpdateGoalsSchema } from "../../schemas/update-goals.schema";

export type UpdateGoalsDto = z.infer<typeof UpdateGoalsSchema>;
