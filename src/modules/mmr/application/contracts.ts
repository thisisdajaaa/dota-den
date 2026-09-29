import { z } from "zod";
import { EARLIEST_OBSERVATION, MMR_MAX, MMR_MIN, type MmrEntry } from "../domain/mmr-entry";

/** Allowed clock skew when checking that an observation isn't in the future. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Input for creating/editing an MMR entry. Shared by the browser form (instant feedback)
 * and the route handlers (trust boundary).
 */
export const MmrEntryInputSchema = z.object({
  mmr: z.coerce
    .number({ error: "Enter your MMR as a number" })
    .int("MMR is a whole number")
    .min(MMR_MIN, `MMR can't be below ${MMR_MIN}`)
    .max(MMR_MAX, `MMR can't be above ${MMR_MAX.toLocaleString("en-US")}`),
  observedAt: z.coerce
    .date({ error: "Pick when you saw this MMR" })
    .refine((d) => d.getTime() <= Date.now() + FUTURE_TOLERANCE_MS, "That time is in the future")
    .refine((d) => d >= EARLIEST_OBSERVATION, "That date is too far in the past"),
  note: z
    .string()
    .trim()
    .max(280, "Keep notes under 280 characters")
    // The form sends null for an empty note after its own parse; accept both.
    .nullish()
    .transform((v) => (v ? v : null)),
});

export type MmrEntryInput = z.output<typeof MmrEntryInputSchema>;

export interface MmrEntryDto {
  id: string;
  mmr: number;
  observedAt: string;
  note: string | null;
}

export function toMmrEntryDto(e: MmrEntry): MmrEntryDto {
  return { id: e.id, mmr: e.mmr, observedAt: e.observedAt.toISOString(), note: e.note };
}
