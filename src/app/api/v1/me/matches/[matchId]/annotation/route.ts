import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/common/http/http";
import { rateLimit } from "@/common/http/rate-limit";
import { saveMatchAnnotation } from "@/modules/annotations/composition";
import { MAX_NOTE_LENGTH, normalizeTags } from "@/modules/annotations/domain/annotation";
import { getRouteUser } from "@/modules/identity/composition";

const Body = z.object({
  tags: z.array(z.string().max(60)).max(20),
  note: z.string().max(MAX_NOTE_LENGTH),
});

/** Save your tags and note on one of your matches (private to you). */
export async function PUT(
  req: NextRequest,
  { params }: RouteContext<"/api/v1/me/matches/[matchId]/annotation">,
): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");
  if (!(await rateLimit(`annotation:${user.id}`, 60, 60_000))) {
    return apiError("rate_limited", "Too many saves. Try again in a minute.");
  }
  const { matchId } = await params;
  if (!/^\d{6,20}$/.test(matchId)) return apiError("bad_request", "Invalid match id");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Invalid tags or note");
  const annotation = {
    userId: user.id,
    accountId32: user.accountId32,
    matchId,
    tags: normalizeTags(body.data.tags),
    note: body.data.note.trim(),
    updatedAt: new Date(),
  };
  await saveMatchAnnotation(annotation);
  return NextResponse.json({ tags: annotation.tags, note: annotation.note });
}
