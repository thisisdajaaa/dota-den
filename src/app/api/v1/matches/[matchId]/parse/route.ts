import { NextResponse, type NextRequest } from "next/server";
import { apiError, isSameOrigin } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getOpenDotaAdapter } from "@/modules/matches/composition";

const MATCH_ID = /^\d{6,20}$/;

/** Ask OpenDota to parse a match's replay (laning, item timings, wards). */
export async function POST(
  req: NextRequest,
  { params }: RouteContext<"/api/v1/matches/[matchId]/parse">,
): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  if (!(await rateLimit(`match-parse:${clientKey(req)}`, 6, 10 * 60_000))) {
    return apiError("rate_limited", "Too many parse requests. Try again in a few minutes.");
  }
  const { matchId } = await params;
  if (!MATCH_ID.test(matchId)) return apiError("bad_request", "Invalid match id");
  const res = await getOpenDotaAdapter().requestParse(matchId);
  if (!res.ok) {
    return res.error.type === "rate_limited"
      ? apiError("rate_limited", "OpenDota is busy. Try again in a minute.")
      : apiError("upstream_unavailable", "OpenDota couldn't take the request right now.");
  }
  return NextResponse.json({ requested: true }, { status: 202 });
}
