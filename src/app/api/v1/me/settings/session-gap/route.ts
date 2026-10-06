import { NextResponse, type NextRequest } from "next/server";
import { apiError, isSameOrigin } from "@/common/http/http";
import { rateLimit } from "@/common/http/rate-limit";
import { getRouteUser } from "@/modules/identity/composition";
import {
  GAP_CHANGES_PER_MINUTE,
  SessionGapInputSchema,
} from "@/modules/sessions/application/contracts";
import { getSessionService } from "@/modules/sessions/composition";

/** The signed-in user's session inactivity gap, in minutes. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");
  const gapMinutes = await (
    await getSessionService()
  ).gap({ userId: user.id, accountId32: user.accountId32 });
  const res = NextResponse.json({ gapMinutes });
  res.headers.set("cache-control", "private, no-store");
  return res;
}

/** Change how long a break splits two sessions (30, 60, 90 or 120 minutes). */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");
  if (!(await rateLimit(`session-gap:${user.id}`, GAP_CHANGES_PER_MINUTE, 60_000)))
    return apiError("rate_limited", "Too many changes. Try again in a minute.");

  const parsed = SessionGapInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError("bad_request", "Pick a valid gap", parsed.error.flatten().fieldErrors);
  }
  await (
    await getSessionService()
  ).setGap({ userId: user.id, accountId32: user.accountId32 }, parsed.data.gapMinutes);
  return NextResponse.json({ gapMinutes: parsed.data.gapMinutes });
}
