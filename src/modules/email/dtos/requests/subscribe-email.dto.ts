import type { z } from "zod";
import type { SubscribeEmailSchema } from "../../schemas/email.schema";

export type SubscribeEmailDto = z.infer<typeof SubscribeEmailSchema>;
