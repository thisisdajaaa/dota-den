import { z } from "zod";

const SideSchema = z.enum(["radiant", "dire"]);

export const RoomParamsSchema = z.object({ roomId: z.string().max(64) });

/** Room ids are 10 letters and digits; anything else is a room that doesn't exist. */
export const ROOM_ID = /^[A-Za-z0-9]{10}$/;

/** POST /api/v1/drafts/rooms */
export const CreateRoomSchema = z.object({
  rulesetId: z.string().min(1).max(40),
  firstSide: SideSchema,
  hostSide: SideSchema,
  timerEnabled: z.boolean(),
});

/** POST /api/v1/drafts/rooms/:roomId/join */
export const JoinRoomSchema = z.object({ side: SideSchema });

/** POST /api/v1/drafts/rooms/:roomId/actions */
export const RoomActionSchema = z.object({
  action: z.discriminatedUnion("type", [
    z.object({ type: z.enum(["pick", "ban"]), heroId: z.number().int().min(1).max(1000) }),
    z.object({ type: z.enum(["pause", "resume"]) }),
  ]),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().min(8).max(64),
});

/** POST /api/v1/drafts/rooms/:roomId/result */
export const ReportResultSchema = z.object({ winner: z.enum(["radiant", "dire", "not_played"]) });
