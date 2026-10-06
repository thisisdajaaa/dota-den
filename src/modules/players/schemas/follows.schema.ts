import { z } from "zod";
import { ACCOUNT_ID_MAX, ACCOUNT_ID_MIN } from "../domain/player-lookup";

/** POST /api/v1/me/follows */
export const FollowInputSchema = z
  .object({ accountId32: z.number().int().min(ACCOUNT_ID_MIN).max(ACCOUNT_ID_MAX) })
  .strict();

export type FollowInput = z.infer<typeof FollowInputSchema>;
