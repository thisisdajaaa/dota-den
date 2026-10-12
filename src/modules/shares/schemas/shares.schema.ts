import { z } from "zod";
import { SESSION_ID_PATTERN } from "@/modules/sessions/domain/session";
import { SLUG_PATTERN } from "../domain/share";

export const CreateShareSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("session"), ref: z.string().regex(SESSION_ID_PATTERN) }).strict(),
  z.object({ kind: z.literal("week") }).strict(),
]);

export const ShareSlugParams = z.object({ slug: z.string().regex(SLUG_PATTERN) });
