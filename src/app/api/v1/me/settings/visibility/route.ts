import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getRouteUser, setProfileVisibility } from "@/modules/identity/composition";

const BodySchema = z
  .object({ profileVisibility: z.enum(["private", "friends", "public"]) })
  .strict();

/**
 * Who can see your profile and activity. Private by default (spec §5); "public" also lists
 * you on the Everyone leaderboards.
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");
  if (!rateLimit(`visibility:${user.id}`, 20, 60_000))
    return apiError("rate_limited", "Too many changes. Try again in a minute.");
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Pick private, friends or public");
  const saved = await setProfileVisibility(user.id, body.data.profileVisibility);
  if (!saved) return apiError("not_found", "Account not found");
  return NextResponse.json({ profileVisibility: body.data.profileVisibility });
}
