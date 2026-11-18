import { z } from "zod";
import { GAP_OPTIONS, isGapMinutes, type GapMinutes } from "../domain/session";
import { GOAL_MAX, GOAL_MET_VALUES, NOTE_MAX } from "../domain/session-note";
import { STOP_LOSS_RANGES, type StopLossRule } from "../domain/stop-loss";

/**
 * PUT /api/v1/sessions/[sessionId]/notes. Shared by the browser form (instant feedback)
 * and the route handler (trust boundary). Empty strings mean "no note"/"no goal".
 */
export const SessionNoteInputSchema = z
  .object({
    note: z
      .string({ error: "Notes must be text" })
      .trim()
      .max(NOTE_MAX, `Keep notes under ${NOTE_MAX.toLocaleString("en-US")} characters`)
      .nullish()
      .transform((v) => v ?? ""),
    goal: z
      .string({ error: "The goal must be text" })
      .trim()
      .max(GOAL_MAX, `Keep the goal under ${GOAL_MAX} characters`)
      .nullish()
      .transform((v) => v ?? ""),
    // The form's select uses "" for "not decided yet".
    goalMet: z
      .enum(GOAL_MET_VALUES, { error: "Pick yes, no or partly" })
      .or(z.literal(""))
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .strict()
  .refine((v) => v.goalMet === null || v.goal.length > 0, {
    path: ["goalMet"],
    message: "Set a goal before marking whether you met it",
  });

export type SessionNoteInput = z.output<typeof SessionNoteInputSchema>;

/** PUT /api/v1/me/settings/session-gap */
export const SessionGapInputSchema = z
  .object({
    gapMinutes: z.coerce
      .number({ error: "Pick a gap in minutes" })
      .refine(isGapMinutes, `Pick one of ${GAP_OPTIONS.join(", ")} minutes`)
      .transform((v) => v as GapMinutes),
  })
  .strict();

export type SessionGapInput = z.output<typeof SessionGapInputSchema>;

const limit = (rule: StopLossRule, what: string) => {
  const { min, max } = STOP_LOSS_RANGES[rule];
  const message = `Pick ${min} to ${max} ${what}`;
  return z.number({ error: message }).int(message).min(min, message).max(max, message).nullable();
};

/** PUT /api/v1/me/settings/stop-loss. Null turns a rule off. */
export const StopLossInputSchema = z
  .object({
    enabled: z.boolean({ error: "Say whether the stop-loss is on" }),
    limits: z
      .object({
        losses: limit("losses", "losses"),
        streak: limit("streak", "losses in a row"),
        games: limit("games", "games"),
      })
      .strict(),
  })
  .strict()
  .refine((v) => !v.enabled || Object.values(v.limits).some((l) => l !== null), {
    path: ["limits"],
    message: "Set at least one limit, or turn the stop-loss off",
  });

export type StopLossInput = z.output<typeof StopLossInputSchema>;
