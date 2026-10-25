import { AppError } from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import type { CoachLocale } from "../domain/coach-facts";
import {
  AUTO_REVIEW_CLAIM_MS,
  AUTO_REVIEW_FIRST_DELAY_SEC,
  AUTO_REVIEW_MAX_AGE_MS,
  AUTO_REVIEW_PER_SYNC,
  nextRetryDelaySec,
  type AutoReviewOutcome,
} from "../domain/auto-review";
import type { CoachResultDto } from "../dtos/responses/coach.dto";
import type { AutoReviewsPort } from "../matches.ports";

/** One scheduled attempt (the job's payload). */
export interface AutoReviewAttempt {
  userId: string;
  matchId: string;
  attempt: number;
}

/** The pushed message: the caller translates it into the player's language. */
export interface AutoReviewNews {
  heroId: number;
  /** The first coaching point's title. */
  first: string;
  points: number;
}

/**
 * Plus auto post-game reviews. After a supporter's sync imports new ranked games, the newest
 * few are scheduled; each attempt asks the AI coach for the review (which needs the parsed
 * replay) and, once it's written, tells the player with a push. Unparsed replays are retried
 * with growing waits, then given up. The player's `coach_review` notification setting is the
 * switch: off means no automatic reviews at all (and no AI cost).
 */
export class AutoReviewService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      reviews: AutoReviewsPort;
      isPlus: (userId: string) => Promise<boolean>;
      /** The player's `coach_review` setting (on by default). */
      wants: (userId: string) => Promise<boolean>;
      user: (userId: string) => Promise<{ accountId32: number; locale: CoachLocale } | null>;
      /** The AI coach (writes, or re-opens, the review). Throws its AppErrors. */
      review: (
        user: { id: string; accountId32: number },
        matchId: string,
        locale: CoachLocale,
      ) => Promise<CoachResultDto>;
      enqueue: (attempt: AutoReviewAttempt, delaySec: number) => Promise<void>;
      /** Push once per match; returns how many devices got it. */
      notify: (userId: string, matchId: string, news: AutoReviewNews) => Promise<number>;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /** After a sync: schedule the newest ranked games that aren't scheduled yet. */
  async afterSync(user: { id: string; accountId32: number }): Promise<number> {
    if (!(await this.deps.isPlus(user.id).catch(() => false))) return 0;
    if (!(await this.deps.wants(user.id).catch(() => false))) return 0;
    const now = this.now();
    const recent = await this.deps.reviews.recentRanked(
      user.accountId32,
      new Date(now.getTime() - AUTO_REVIEW_MAX_AGE_MS),
      AUTO_REVIEW_PER_SYNC,
    );
    let scheduled = 0;
    for (const matchId of recent) {
      if (!(await this.deps.reviews.claim(user.id, matchId, now, AUTO_REVIEW_CLAIM_MS))) continue;
      await this.deps.enqueue(
        { userId: user.id, matchId, attempt: 0 },
        AUTO_REVIEW_FIRST_DELAY_SEC,
      );
      scheduled++;
    }
    if (scheduled > 0)
      this.deps.logger.info("auto_review_scheduled", {
        accountId32: user.accountId32,
        scheduled,
      });
    return scheduled;
  }

  /** One attempt (the job). Never throws: a failure is logged and retried or given up. */
  async run(payload: Record<string, unknown>): Promise<AutoReviewOutcome> {
    const attempt = parseAttempt(payload);
    if (!attempt) return "failed";
    const outcome = await this.attempt(attempt).catch((error: unknown) => {
      this.deps.logger.warn("auto_review_error", { matchId: attempt.matchId, error });
      return this.retry(attempt);
    });
    this.deps.logger.info("auto_review_attempt", {
      matchId: attempt.matchId,
      attempt: attempt.attempt,
      outcome,
    });
    return outcome;
  }

  private async attempt(a: AutoReviewAttempt): Promise<AutoReviewOutcome> {
    // Checked again on every attempt: Plus can lapse, or the player turn it off, meanwhile.
    if (!(await this.deps.isPlus(a.userId))) return "not_plus";
    if (!(await this.deps.wants(a.userId))) return "turned_off";
    const user = await this.deps.user(a.userId);
    if (!user) return "no_user";

    let result: CoachResultDto;
    try {
      result = await this.deps.review(
        { id: a.userId, accountId32: user.accountId32 },
        a.matchId,
        user.locale,
      );
    } catch (error) {
      const reason = error instanceof AppError ? reasonOf(error) : null;
      // Not parsed yet, or OpenDota busy: worth another try later.
      if (reason === "unparsed" || (error instanceof AppError && retryable(error)))
        return this.retry(a);
      // The day's AI budget is spent; tomorrow's sync schedules the next games.
      if (reason === "resting") return "budget_spent";
      this.deps.logger.warn("auto_review_failed", {
        matchId: a.matchId,
        code: error instanceof AppError ? error.code : "unknown",
        reason,
      });
      return "failed";
    }
    // The player already opened it themself: nothing new to tell them.
    if (result.cached) return "already_written";
    const first = result.review.points[0];
    await this.deps.notify(a.userId, a.matchId, {
      heroId: result.review.heroId,
      first: first?.title ?? "",
      points: result.review.points.length,
    });
    return "written";
  }

  private async retry(a: AutoReviewAttempt): Promise<AutoReviewOutcome> {
    const delay = nextRetryDelaySec(a.attempt);
    if (delay === null) return "gave_up";
    await this.deps.enqueue({ ...a, attempt: a.attempt + 1 }, delay);
    return "retry_later";
  }
}

function parseAttempt(p: Record<string, unknown>): AutoReviewAttempt | null {
  const { userId, matchId, attempt } = p;
  if (typeof userId !== "string" || !/^[a-f0-9]{24}$/.test(userId)) return null;
  if (typeof matchId !== "string" || !/^\d{1,20}$/.test(matchId)) return null;
  if (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 0) return null;
  return { userId, matchId, attempt };
}

function reasonOf(error: AppError): string | null {
  const details = error.details as { reason?: unknown } | undefined;
  return typeof details?.reason === "string" ? details.reason : null;
}

/** OpenDota rate limits and outages pass; a bad request or a missing match doesn't. */
function retryable(error: AppError): boolean {
  if (error.code === "rate_limited") return reasonOf(error) !== "quota";
  return error.code === "upstream_unavailable" && reasonOf(error) === null;
}
