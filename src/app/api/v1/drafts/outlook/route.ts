import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { decodeSnapshot } from "@/modules/drafts/application/snapshot";
import { getAiOpponent } from "@/modules/drafts/composition";

const BodySchema = z.object({ snapshot: z.string().min(1).max(2_000) });

/** Which side the draft favours so far: an estimate from public and tournament data. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  if (!rateLimit(`draft-outlook:${clientKey(req)}`, 60, 60_000)) {
    return apiError("rate_limited", "Too many requests in the last minute.");
  }
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Invalid request");
  const snapshot = decodeSnapshot(body.data.snapshot);
  if (!snapshot.ok) return apiError("bad_request", "Invalid draft");

  const res = await (await getAiOpponent()).outlook(snapshot.value);
  if (!res.ok) return apiError("bad_request", "Invalid draft");
  return NextResponse.json(res.value);
}
