import { NextResponse, type NextRequest } from "next/server";
import { apiError, isSameOrigin } from "@/common/http/http";
import { clientKey, rateLimit } from "@/common/http/rate-limit";
import { getRouteUser } from "@/modules/identity";
import { FOLLOW_MUTATIONS_PER_MINUTE } from "@/modules/players/application/contracts";
import { ownerOf } from "@/modules/players/application/follow-service";
import { getFollowService } from "@/modules/players/composition";
import { parseAccountId } from "@/modules/players/domain/player-lookup";

/** Stop tracking a player. Idempotent: 204 whether or not they were tracked. */
export async function DELETE(
  req: NextRequest,
  { params }: RouteContext<"/api/v1/me/follows/[accountId]">,
): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  if (!(await rateLimit(`follows:${clientKey(req)}`, FOLLOW_MUTATIONS_PER_MINUTE, 60_000)))
    return apiError("rate_limited", "Too many changes. Try again in a minute.");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");

  const accountId32 = parseAccountId((await params).accountId);
  if (accountId32 === null) return apiError("bad_request", "Invalid account id");
  await (await getFollowService()).unfollow(ownerOf(user), accountId32);
  return new NextResponse(null, { status: 204 });
}
