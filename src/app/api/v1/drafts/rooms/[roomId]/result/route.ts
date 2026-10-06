import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/common/http/http";
import { apiLimitArgs } from "@/common/http/api-limits";
import { clientKey, rateLimit } from "@/common/http/rate-limit";
import { getRouteUser } from "@/modules/identity/composition";
import { getDraftHistoryService } from "@/modules/drafts/composition";
import {
  historyErrorResponse,
  noStore,
  readRoomParams,
  routeActor,
} from "@/modules/drafts/room-http";

type Ctx = { params: Promise<{ roomId: string }> };

/** The self-reported result of the real game played with a finished draft. */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const roomId = await readRoomParams(ctx);
  if (!roomId) return apiError("not_found", "Draft room not found");
  if (
    !(await rateLimit(`room-poll:${clientKey(req)}`, ...apiLimitArgs("roomPoll"), { local: true }))
  ) {
    return apiError("rate_limited", "Polling too fast");
  }
  const user = await getRouteUser(req);
  const res = await (await getDraftHistoryService()).getResult(roomId, user?.id ?? null);
  if (!res.ok) return historyErrorResponse(res.error);
  return noStore(NextResponse.json({ result: res.value }));
}

const BodySchema = z.object({ winner: z.enum(["radiant", "dire", "not_played"]) });

/** Either captain says which side won the game they played (or that they didn't play it). */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const roomId = await readRoomParams(ctx);
  if (!roomId) return apiError("not_found", "Draft room not found");
  const actor = await routeActor(req);
  if (!actor) return apiError("unauthorized", "Sign in to do that");
  if (!(await rateLimit(`room-act:${clientKey(req)}`, ...apiLimitArgs("roomAction")))) {
    return apiError("rate_limited", "Too many actions in the last minute");
  }
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Choose Radiant, Dire or not played.");
  const service = await getDraftHistoryService();
  const res = await service.reportResult(
    roomId,
    { userId: actor.userId, name: actor.captain.name },
    body.data.winner,
  );
  if (!res.ok) return historyErrorResponse(res.error);
  return noStore(NextResponse.json({ result: res.value }));
}
