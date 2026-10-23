import { z } from "zod";

/**
 * The AI match coach's answer, as the prompt asks for it. Checked before anything else; the
 * grounding checks (known fact keys, no invented numbers) run on the parsed answer.
 */
export const CoachAnswerSchema = z.object({
  points: z
    .array(
      z.object({
        kind: z.enum(["strength", "improve"]),
        title: z.string().trim().min(3).max(90),
        detail: z.string().trim().min(10).max(420),
        facts: z.array(z.string().trim().min(1).max(60)).max(6),
      }),
    )
    .min(1)
    .max(8),
});

export type CoachAnswer = z.infer<typeof CoachAnswerSchema>;

export const CoachParamsSchema = z.object({
  matchId: z.string().regex(/^\d{6,20}$/, "Invalid match id"),
});
