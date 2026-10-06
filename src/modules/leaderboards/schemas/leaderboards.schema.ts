import { z } from "zod";

/** POST /api/v1/drafts/results */
export const DraftResultInputSchema = z
  .object({
    snapshot: z.string().min(1).max(2_000),
    aiSide: z.enum(["radiant", "dire"]).nullable(),
  })
  .strict();

/** Draft results a player may submit per window (a real draft takes minutes). */
export const DRAFT_RESULTS_PER_WINDOW = 10;
export const DRAFT_RESULTS_WINDOW_MS = 10 * 60_000;
