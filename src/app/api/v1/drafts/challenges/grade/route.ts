import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { CHALLENGE_TYPES, SEED_PATTERN } from "@/modules/drafts/domain/challenges";
import { getChallengeService } from "@/modules/drafts/composition";

const BodySchema = z.object({
  type: z.enum(CHALLENGE_TYPES),
  seed: z.string().regex(SEED_PATTERN),
  heroIds: z.array(z.number().int().positive()).min(1).max(2),
});

/**
 * Grade a draft challenge answer. The client only names the puzzle ({type, seed}) and its
 * answer; the server rebuilds the position, checks the answer is legal, then grades it.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  if (!rateLimit(`draft-challenge:${clientKey(req)}`, 30, 60_000)) {
    return apiError("rate_limited", "Too many answers in the last minute. Take a breath.");
  }
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Invalid request");

  const { type, seed, heroIds } = body.data;
  const res = await (await getChallengeService()).grade(type, seed, heroIds);
  if (!res.ok) {
    switch (res.error.type) {
      case "not_enough_heroes":
        return apiError("upstream_unavailable", "The hero list is unavailable right now.");
      case "illegal_answer": {
        const cause = res.error.cause;
        const message =
          cause.type === "wrong_count"
            ? `Choose exactly ${cause.expected} hero${cause.expected === 1 ? "" : "es"}.`
            : cause.type === "duplicate"
              ? "Choose different heroes."
              : "That hero isn't available in this puzzle.";
        return apiError("bad_request", message, { reason: cause.type });
      }
      default:
        return apiError("bad_request", "Invalid puzzle");
    }
  }
  return NextResponse.json({ type, seed, ...res.value.result });
}
