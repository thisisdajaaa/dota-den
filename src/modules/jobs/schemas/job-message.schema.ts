import { z } from "zod";

/** A job delivered by QStash. */
export const JobMessageSchema = z.object({
  payload: z.record(z.string(), z.unknown()).default({}),
  dedupKey: z.string().max(200).nullable().default(null),
});
