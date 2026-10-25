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

const heroIds = (max: number) =>
  z
    .array(z.number().int().positive().max(1000))
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, "A hero is listed twice");

/** "Pick for me": the draft so far in a real ranked game. */
export const PickForMeSchema = z
  .object({
    enemies: heroIds(5),
    allies: heroIds(4),
    bans: heroIds(24).default([]),
    position: z.number().int().min(1).max(5).nullable().default(null),
  })
  .refine(
    (b) =>
      new Set([...b.enemies, ...b.allies, ...b.bans]).size ===
      b.enemies.length + b.allies.length + b.bans.length,
    "A hero can only be in one place",
  );
