import { NextResponse, type NextRequest } from "next/server";
import { apiError, isSameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getRouteUser } from "@/modules/identity/composition";
import {
  NOTE_SAVES_PER_MINUTE,
  SessionNoteInputSchema,
  toSessionNoteDto,
} from "@/modules/sessions/application/contracts";
import { getSessionService } from "@/modules/sessions/composition";
import { sessionIdFromParam } from "@/modules/sessions/domain/session";

type Ctx = { params: Promise<{ sessionId: string }> };

/** Save (create or replace) the signed-in user's note and goal for one of their sessions. */
export async function PUT(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");
  if (!rateLimit(`session-notes:${user.id}`, NOTE_SAVES_PER_MINUTE, 60_000))
    return apiError("rate_limited", "Too many saves. Try again in a minute.");

  const sessionId = sessionIdFromParam((await params).sessionId);
  if (!sessionId) return apiError("not_found", "Session not found");

  const parsed = SessionNoteInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "bad_request",
      "Check the highlighted fields",
      parsed.error.flatten().fieldErrors,
    );
  }
  const res = await (
    await getSessionService()
  ).saveNote({ userId: user.id, accountId32: user.accountId32 }, sessionId, parsed.data);
  // Another account's session is indistinguishable from a missing one.
  return res.ok
    ? NextResponse.json(toSessionNoteDto(res.value))
    : apiError("not_found", "Session not found");
}
