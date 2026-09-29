import { z } from "zod";
import { GAP_OPTIONS, isGapMinutes, type GapMinutes } from "../domain/session";
import { GOAL_MAX, GOAL_MET_VALUES, NOTE_MAX, type SessionNote } from "../domain/session-note";

/** Note saves allowed per user per minute. */
export const NOTE_SAVES_PER_MINUTE = 30;
/** Gap setting changes allowed per user per minute. */
export const GAP_CHANGES_PER_MINUTE = 20;

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

export interface SessionNoteDto {
  sessionId: string;
  note: string;
  goal: string;
  goalMet: SessionNote["goalMet"];
  updatedAt: string;
}

/** Never exposes the owner's user id. */
export function toSessionNoteDto(n: SessionNote): SessionNoteDto {
  return {
    sessionId: n.sessionId,
    note: n.note,
    goal: n.goal,
    goalMet: n.goalMet,
    updatedAt: n.updatedAt.toISOString(),
  };
}
