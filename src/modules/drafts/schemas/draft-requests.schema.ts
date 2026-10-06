import { z } from "zod";
import { CHALLENGE_TYPES, SEED_PATTERN } from "../domain/challenges";
import { RolesSchema } from "./roles.schema";

const Snapshot = z.string().min(1).max(2_000);
const SideSchema = z.enum(["radiant", "dire"]);

/** POST /api/v1/drafts/ai-move */
export const AiMoveSchema = z.object({ snapshot: Snapshot, aiSide: SideSchema });

/** POST /api/v1/drafts/suggestions */
export const SuggestionsSchema = z.object({
  snapshot: Snapshot,
  side: SideSchema,
  roles: RolesSchema,
});

/** POST /api/v1/drafts/outlook and /review */
export const OutlookSchema = z.object({ snapshot: Snapshot, roles: RolesSchema });

/** POST /api/v1/drafts/challenges/grade */
export const GradeSchema = z.object({
  type: z.enum(CHALLENGE_TYPES),
  seed: z.string().regex(SEED_PATTERN),
  heroIds: z.array(z.number().int().positive()).min(1).max(2),
});
