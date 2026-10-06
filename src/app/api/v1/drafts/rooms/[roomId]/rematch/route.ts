import { NextResponse, type NextRequest } from "next/server";

import { apiError, isSameOrigin } from "@/common/http/http";
import { apiLimitArgs } from "@/common/http/api-limits";
import { clientKey, rateLimit } from "@/common/http/rate-limit";
import { getDraftRoomService } from "@/modules/drafts/composition";
import {
  readRoomParams,
  roomErrorResponse,
  roomView,
  routeActor,
} from "@/modules/drafts/room-http";

type Ctx = { params: Promise<{ roomId: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const roomId = await readRoomParams(ctx);
  if (!roomId) return apiError("not_found", "Draft room not found");
  const actor = await routeActor(req);
  if (!actor) return apiError("unauthorized", "Sign in to do that");
  if (!(await rateLimit(`room-act:${clientKey(req)}`, ...apiLimitArgs("roomAction")))) {
    return apiError("rate_limited", "Too many actions in the last minute");
  }
  const service = await getDraftRoomService();
  const res = await service.rematch(roomId, actor);
  if (!res.ok) return roomErrorResponse(res.error, actor.userId);
  return NextResponse.json({ roomId: res.value.id, room: roomView(res.value, actor.userId) });
}
