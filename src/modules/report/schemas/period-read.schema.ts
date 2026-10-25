import { z } from "zod";

/** The model's answer for a period read (the service then checks it against the facts). */
export const PeriodReadAnswerSchema = z.object({
  points: z
    .array(
      z.object({
        kind: z.enum(["strength", "improve", "focus"]),
        title: z.string().trim().min(3).max(90),
        detail: z.string().trim().min(10).max(420),
        // More than six cited facts keeps the first six instead of failing the answer.
        facts: z
          .array(z.string().trim().min(1).max(60))
          .max(20)
          .transform((keys) => keys.slice(0, 6)),
      }),
    )
    .min(1)
    .max(8),
});

/** POST /api/v1/report/read: the period to read (the report page's range). */
export const PeriodReadRequestSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
