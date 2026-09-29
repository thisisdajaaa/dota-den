import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getDraftRoomService } from "@/modules/drafts/composition";
import {
  readRoomParams,
  roomErrorResponse,
  roomView,
  routeActor,
} from "@/modules/drafts/room-http";

type Ctx = { params: Promise<{ roomId: string }> };

const BodySchema = z.object({ side: z.enum(["radiant", "dire"]) });
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const roomId = await readRoomParams(ctx);
  if (!roomId) return apiError("not_found", "Draft room not found");
  const actor = await routeActor(req);
  if (!actor) return apiError("unauthorized", "Sign in to do that");
  if (!rateLimit(`room-act:${clientKey(req)}`, 120, 60_000)) {
    return apiError("rate_limited", "Too many actions in the last minute");
  }
  const service = await getDraftRoomService();
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Pick a side");
  const res = await service.join(roomId, actor, body.data.side);
  if (!res.ok) return roomErrorResponse(res.error, actor.userId);
  return NextResponse.json({ room: roomView(res.value, actor.userId) });
}
