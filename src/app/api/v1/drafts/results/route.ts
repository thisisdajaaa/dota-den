import { NextResponse, type NextRequest } from "next/server";
import { apiError, isSameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getRouteUser } from "@/modules/identity/composition";
import {
  DRAFT_RESULTS_PER_WINDOW,
  DRAFT_RESULTS_WINDOW_MS,
  DraftResultInputSchema,
} from "@/modules/leaderboards/application/contracts";
import { getActivityService } from "@/modules/leaderboards/composition";

/**
 * Record a finished draft against the AI captain (`aiSide`) or in practice (`aiSide: null`)
 * for the leaderboards. The draft is replayed and must be complete; the same draft counts
 * once per player (201 when newly counted, 200 with `counted: false` on a repeat).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Sign in to save your drafts");
  if (
    !(await rateLimit(
      `draft-results:${user.id}`,
      DRAFT_RESULTS_PER_WINDOW,
      DRAFT_RESULTS_WINDOW_MS,
    ))
  ) {
    return apiError("rate_limited", "Too many drafts saved in the last few minutes.");
  }
  const body = DraftResultInputSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Invalid request");

  const res = await (await getActivityService()).recordDraft(user.id, body.data);
  if (!res.ok) {
    switch (res.error.type) {
      case "heroes_unavailable":
        return apiError("upstream_unavailable", "The hero list is unavailable right now.");
      case "not_completed":
        return apiError("bad_request", "Only finished drafts count.", { reason: "not_completed" });
      default:
        return apiError("bad_request", "Invalid draft", { reason: "invalid_snapshot" });
    }
  }
  const response = NextResponse.json(res.value, { status: res.value.counted ? 201 : 200 });
  response.headers.set("cache-control", "private, no-store");
  return response;
}
