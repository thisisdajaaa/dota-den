import "server-only";
import { env, type Env } from "@/lib/env";

/** One rate limit: at most `limit` requests per `windowMs`, per key. */
export interface ApiLimit {
  limit: number;
  windowMs: number;
}

export type ApiLimitName =
  | "draftAiMove"
  | "draftSuggestions"
  | "draftOutlook"
  | "draftReview"
  | "draftChallenge"
  | "roomCreate"
  | "roomPoll"
  | "roomAction";

const MINUTE = 60_000;

/**
 * Rate limits for the public draft API, from the environment (docs/configuration.md).
 * Routes pass these to `rateLimit()`; the limiter itself stays unaware of configuration.
 */
export function apiLimitsFrom(
  e: Pick<Env, Extract<keyof Env, `RATE_LIMIT_${string}`>>,
): Record<ApiLimitName, ApiLimit> {
  return {
    draftAiMove: { limit: e.RATE_LIMIT_DRAFT_AI_MOVE_PER_MIN, windowMs: MINUTE },
    draftSuggestions: { limit: e.RATE_LIMIT_DRAFT_SUGGESTIONS_PER_MIN, windowMs: MINUTE },
    draftOutlook: { limit: e.RATE_LIMIT_DRAFT_OUTLOOK_PER_MIN, windowMs: MINUTE },
    draftReview: { limit: e.RATE_LIMIT_DRAFT_REVIEW_PER_MIN, windowMs: MINUTE },
    draftChallenge: { limit: e.RATE_LIMIT_DRAFT_CHALLENGE_PER_MIN, windowMs: MINUTE },
    roomCreate: { limit: e.RATE_LIMIT_ROOM_CREATE_PER_HOUR, windowMs: 60 * MINUTE },
    roomPoll: { limit: e.RATE_LIMIT_ROOM_POLL_PER_MIN, windowMs: MINUTE },
    roomAction: { limit: e.RATE_LIMIT_ROOM_ACTION_PER_MIN, windowMs: MINUTE },
  };
}

/** The configured limit for one route family. */
export function apiLimit(name: ApiLimitName): ApiLimit {
  return apiLimitsFrom(env())[name];
}

/** `[limit, windowMs]` for one route family, to spread into `rateLimit(key, ...)`. */
export function apiLimitArgs(name: ApiLimitName): [limit: number, windowMs: number] {
  const { limit, windowMs } = apiLimit(name);
  return [limit, windowMs];
}
