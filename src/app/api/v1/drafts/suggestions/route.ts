import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { apiLimitArgs } from "@/lib/api-limits";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { decodeSnapshot } from "@/modules/drafts/application/snapshot";
import { getAiOpponent } from "@/modules/drafts/composition";

const BodySchema = z.object({
  snapshot: z.string().min(1).max(2_000),
  side: z.enum(["radiant", "dire"]),
});

/** Data-backed pick/ban suggestions for the side whose turn it is (no language model). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  if (!(await rateLimit(`draft-suggest:${clientKey(req)}`, ...apiLimitArgs("draftSuggestions")))) {
    return apiError("rate_limited", "Too many suggestion requests in the last minute.");
  }
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Invalid request");
  const snapshot = decodeSnapshot(body.data.snapshot);
  if (!snapshot.ok) return apiError("bad_request", "Invalid draft");

  const res = await (await getAiOpponent()).suggestions(snapshot.value, body.data.side);
  if (!res.ok) {
    const code = res.error.type === "invalid_snapshot" ? "bad_request" : "conflict";
    return apiError(code, `No suggestions: ${res.error.type.replaceAll("_", " ")}`);
  }
  return NextResponse.json({
    action: res.value.action,
    situation: res.value.situation,
    candidates: res.value.candidates.map((c) => ({
      heroId: c.heroId,
      name: c.name,
      role: c.role,
      position: c.position,
      facts: c.facts,
    })),
  });
}
