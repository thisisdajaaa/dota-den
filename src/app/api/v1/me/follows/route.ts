import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/common/http/http";
import { clientKey, rateLimit } from "@/common/http/rate-limit";
import { getRouteUser } from "@/modules/identity/composition";
import {
  FOLLOW_MUTATIONS_PER_MINUTE,
  FollowInputSchema,
  toFollowDto,
} from "@/modules/players/application/contracts";
import { ownerOf } from "@/modules/players/application/follow-service";
import { getFollowService } from "@/modules/players/composition";
import { MAX_FOLLOWS_PER_USER } from "@/modules/players/domain/follow";

/** The signed-in user's tracked players, most recently added first. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");
  const follows = await (await getFollowService()).list(ownerOf(user));
  const res = NextResponse.json({ follows: follows.map(toFollowDto), limit: MAX_FOLLOWS_PER_USER });
  res.headers.set("cache-control", "private, no-store");
  return res;
}

/** Track a player. Idempotent: 201 when newly tracked, 200 when already tracked. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  if (!(await rateLimit(`follows:${clientKey(req)}`, FOLLOW_MUTATIONS_PER_MINUTE, 60_000)))
    return apiError("rate_limited", "Too many changes. Try again in a minute.");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");

  const body = FollowInputSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Invalid body", z.treeifyError(body.error));

  const result = await (await getFollowService()).follow(ownerOf(user), body.data.accountId32);
  if (!result.ok) {
    switch (result.error.type) {
      case "self":
        return apiError("bad_request", "That's your own account");
      case "invalid_account":
        return apiError("bad_request", "Invalid account id");
      case "limit_reached":
        return apiError(
          "conflict",
          `You can track up to ${result.error.limit} players. Untrack someone first.`,
          { limit: result.error.limit },
        );
    }
  }
  return NextResponse.json(toFollowDto(result.value.follow), {
    status: result.value.created ? 201 : 200,
  });
}
