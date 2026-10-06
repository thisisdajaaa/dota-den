import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/common/http/http";
import { logger } from "@/common/logging/logger";
import { apiLimitArgs } from "@/common/http/api-limits";
import { clientKey, rateLimit } from "@/common/http/rate-limit";
import { CHALLENGE_TYPES, SEED_PATTERN, type Grade } from "@/modules/drafts/domain/challenges";
import { getChallengeService } from "@/modules/drafts/composition";
import { getRouteUser } from "@/modules/identity/composition";
import type { ChallengeProgressDto } from "@/modules/leaderboards/application/contracts";
import { getActivityService } from "@/modules/leaderboards/composition";

const BodySchema = z.object({
  type: z.enum(CHALLENGE_TYPES),
  seed: z.string().regex(SEED_PATTERN),
  heroIds: z.array(z.number().int().positive()).min(1).max(2),
});

/**
 * For signed-in players, keep the answer for the leaderboards and the saved streak. A
 * failure here must never cost the player their grade, so it is logged and skipped.
 */
async function recordForUser(
  req: NextRequest,
  answer: { type: string; seed: string; grade: Grade },
): Promise<ChallengeProgressDto | null> {
  try {
    const user = await getRouteUser(req);
    if (!user) return null;
    const { counted, streak } = await (await getActivityService()).recordChallenge(user.id, answer);
    return { counted, streak: streak.current, best: streak.best };
  } catch (error) {
    logger.error("challenge_attempt_record_failed", { error });
    return null;
  }
}

/**
 * Grade a draft challenge answer. The client only names the puzzle ({type, seed}) and its
 * answer; the server rebuilds the position, checks the answer is legal, then grades it.
 * Signed in, the first answer to each puzzle is recorded, and `saved` carries the streak.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  if (!(await rateLimit(`draft-challenge:${clientKey(req)}`, ...apiLimitArgs("draftChallenge")))) {
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
  const result = res.value.result;
  const saved = await recordForUser(req, { type, seed, grade: result.grade });
  return NextResponse.json({ type, seed, ...result, saved });
}
