import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getDraftRoomService } from "@/modules/drafts/composition";
import { roomErrorResponse, routeActor } from "@/modules/drafts/room-http";

const BodySchema = z.object({
  rulesetId: z.string().min(1).max(40),
  firstSide: z.enum(["radiant", "dire"]),
  hostSide: z.enum(["radiant", "dire"]),
  timerEnabled: z.boolean(),
});

/** Create a multiplayer draft room; the host takes a seat. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const actor = await routeActor(req);
  if (!actor) return apiError("unauthorized", "Sign in to create a draft room");
  if (!(await rateLimit(`room-create:${clientKey(req)}`, 10, 60 * 60_000))) {
    return apiError("rate_limited", "You've created a lot of rooms recently. Try again later.");
  }
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Invalid room settings");
  const res = await (await getDraftRoomService()).create(actor, body.data);
  if (!res.ok) return roomErrorResponse(res.error, actor.userId);
  return NextResponse.json({ roomId: res.value.id }, { status: 201 });
}
