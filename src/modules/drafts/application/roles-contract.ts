import { z } from "zod";
import type { Side } from "../domain/draft-state";
import type { Position } from "../domain/draft-positions";

const PositionSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
/** Positions set by hand: hero id -> position. */
const SideRoles = z.record(z.string().regex(/^\d{1,4}$/), PositionSchema).optional();
/** Request field for hand-set positions, per side. */
export const RolesSchema = z.object({ radiant: SideRoles, dire: SideRoles }).optional();

export type RoleMaps = Partial<Record<Side, ReadonlyMap<number, Position>>>;

/** The request's positions as maps the scoring uses. */
export function toRoleMaps(roles: z.infer<typeof RolesSchema>): RoleMaps {
  const toMap = (r: Record<string, Position> | undefined) =>
    r ? new Map(Object.entries(r).map(([id, p]) => [Number(id), p] as const)) : undefined;
  return { radiant: toMap(roles?.radiant), dire: toMap(roles?.dire) };
}
