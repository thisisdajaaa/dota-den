import { z } from "zod";
import { MAX_NOTE_LENGTH } from "../domain/annotation";

export const MatchIdParamsSchema = z.object({
  matchId: z.string().regex(/^\d{6,20}$/, "Invalid match id"),
});

export const SaveAnnotationSchema = z.object({
  tags: z.array(z.string().max(60)).max(20),
  note: z.string().max(MAX_NOTE_LENGTH),
});
