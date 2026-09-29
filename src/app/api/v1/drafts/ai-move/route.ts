import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin, requestId } from "@/lib/http";
import { logger } from "@/lib/logger";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { decodeSnapshot } from "@/modules/drafts/application/snapshot";
import { getAiOpponent } from "@/modules/drafts/composition";

const BodySchema = z.object({
  snapshot: z.string().min(1).max(2_000),
  aiSide: z.enum(["radiant", "dire"]),
});

/** The AI captain's next pick/ban for a local practice draft. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  // A full CM draft is 12 AI moves; allow a few drafts a minute per client.
  if (!rateLimit(`ai-move:${clientKey(req)}`, 40, 60_000)) {
    return apiError("rate_limited", "Slow down a little: too many AI moves in the last minute.");
  }
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Invalid request");
  const snapshot = decodeSnapshot(body.data.snapshot);
  if (!snapshot.ok) return apiError("bad_request", "Invalid draft");

  const started = Date.now();
  const res = await (await getAiOpponent()).move(snapshot.value, body.data.aiSide);
  if (!res.ok) {
    const code = res.error.type === "invalid_snapshot" ? "bad_request" : "conflict";
    return apiError(code, `Can't make an AI move: ${res.error.type.replaceAll("_", " ")}`);
  }
  logger.info("draft_ai_move", {
    requestId: requestId(req),
    source: res.value.source,
    model: res.value.model,
    action: res.value.action,
    durationMs: Date.now() - started,
  });
  return NextResponse.json(res.value);
}
