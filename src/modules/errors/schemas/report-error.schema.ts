import { z } from "zod";

/** An error a browser error page caught. */
export const ReportErrorSchema = z.object({
  message: z.string().max(2_000),
  digest: z.string().max(64).nullable().optional(),
  path: z.string().max(500).nullable().optional(),
  stack: z.string().max(4_000).nullable().optional(),
});
