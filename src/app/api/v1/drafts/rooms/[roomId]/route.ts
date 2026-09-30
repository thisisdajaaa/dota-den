import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/http";
import { apiLimitArgs } from "@/lib/api-limits";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getRouteUser } from "@/modules/identity/composition";
import { getDraftRoomEvents, getDraftRoomService } from "@/modules/drafts/composition";
import {
  eventView,
  noStore,
  readRoomParams,
  roomErrorResponse,
  roomView,
} from "@/modules/drafts/room-http";

type Ctx = { params: Promise<{ roomId: string }> };

/**
 * Poll/resync (ADR 0003): the room plus events after `?after=<sequence>`. `?rev=<n>` returns
 * `{unchanged:true}` cheaply when nothing moved.
 */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const roomId = await readRoomParams(ctx);
  if (!roomId) return apiError("not_found", "Draft room not found");
  // ~1 poll/second per viewer, with headroom for a few tabs.
  if (
    !(await rateLimit(`room-poll:${clientKey(req)}`, ...apiLimitArgs("roomPoll"), { local: true }))
  ) {
    return apiError("rate_limited", "Polling too fast");
  }
  const user = await getRouteUser(req);
  const res = await (await getDraftRoomService()).get(roomId);
  if (!res.ok) return roomErrorResponse(res.error, user?.id ?? null);

  const knownRev = Number(req.nextUrl.searchParams.get("rev"));
  if (Number.isInteger(knownRev) && knownRev === res.value.rev) {
    return noStore(NextResponse.json({ unchanged: true, rev: knownRev, serverNow: Date.now() }));
  }
  const after = Math.max(0, Number(req.nextUrl.searchParams.get("after")) || 0);
  const events = await getDraftRoomEvents(roomId, after);
  return noStore(
    NextResponse.json({
      room: roomView(res.value, user?.id ?? null),
      events: events.map(eventView),
    }),
  );
}
