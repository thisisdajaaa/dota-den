import { z } from "zod";

const factKeys = z
  .array(z.string().trim().min(1).max(60))
  .max(20)
  // More than eight cited facts keeps the first eight instead of failing the answer.
  .transform((keys) => keys.slice(0, 8));

/** The model's weekly note (the service then checks it against the facts). */
export const CoachNoteAnswerSchema = z.object({
  headline: z.string().trim().min(3).max(120),
  paragraphs: z.array(z.string().trim().min(10).max(700)).min(1).max(4),
  facts: factKeys,
  fix: z.object({
    title: z.string().trim().min(3).max(120),
    detail: z.string().trim().min(10).max(500),
    facts: factKeys,
  }),
});

/** POST /api/v1/report/weekly-coach: which week (its Monday); the last full week if left out. */
export const WeeklyCoachRequestSchema = z
  .object({
    week: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();
