import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UpstreamUnavailableError,
} from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import type { DataOwner } from "@/common/privacy/user-data";
import type { Result } from "@/common/result";
import {
  buildCoachFactSheet,
  COACH_PROMPT_VERSION,
  type CoachFactSheet,
  type CoachLocale,
} from "../domain/coach-facts";
import {
  checkCoachPoints,
  COACH_FREE_REVIEWS,
  COACH_QUOTA_WINDOW_MS,
  coachQuota,
  type CoachPoint,
  type CoachQuota,
} from "../domain/coach-review";
import type { MatchDetail, MatchPlayer } from "../domain/match-detail";
import { assignPatch } from "../domain/patch-assignment";
import type { HeroInfo, ItemInfo, ProviderError } from "../domain/read-models";
import {
  toQuotaDto,
  toReviewDto,
  type CoachResultDto,
  type CoachViewDto,
} from "../dtos/responses/coach.dto";
import type {
  AutoReviewsPort,
  CoachReviewKey,
  CoachReviewsPort,
  CoachUsagePort,
  CoachWriter,
  PatchTimelineSource,
  StoredCoachReview,
} from "../matches.ports";
import { CoachAnswerSchema } from "../schemas/coach-review.schema";

/** Model calls per review: the first answer, and one retry when it fails the checks. */
const MAX_ATTEMPTS = 2;
/** How long a free slot is held while a review is written (longer than any generation). */
const HOLD_MS = 3 * 60_000;

export interface CoachUser {
  id: string;
  accountId32: number;
}

/**
 * The AI match coach (ADR 0014): 3–5 coaching points for the signed-in player's own parsed
 * match, written by a language model from a fact sheet of our data and checked against it.
 * Plus is unlimited; free players get one new review per rolling 7 days. Stored reviews are
 * re-shown for free, and only reviews that were actually written count.
 */
export class MatchCoachService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      matches: {
        match(matchId: string): Promise<Result<MatchDetail, ProviderError>>;
        heroMap(): Promise<Map<number, HeroInfo>>;
        itemMap(): Promise<Map<number, ItemInfo>>;
      };
      patches: PatchTimelineSource;
      reviews: CoachReviewsPort;
      usage: CoachUsagePort;
      /** Plus auto reviews scheduled for the player (only for data export and deletion). */
      autoReviews?: Pick<AutoReviewsPort, "exportForOwner" | "deleteForOwner">;
      /** Plus entitlement (false on any failure, and while Plus is switched off). */
      isPlus: (userId: string) => Promise<boolean>;
      /** The model; null when no key is configured (the coach is off). */
      writer: CoachWriter | null;
      /** The global daily model-call budget, shared with the draft AI (ADR 0013/0014). */
      budget: { take(): Promise<boolean> };
      /** Counts a use (admin usage numbers); never fails. */
      used?: (userId: string) => Promise<void>;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => Date;
      freeReviews?: number;
      windowMs?: number;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  get enabled(): boolean {
    return this.deps.writer !== null;
  }

  /**
   * A review is stored per language: the same match in another language is a new review
   * (and, for free players, counts as one).
   */
  private key(matchId: string, accountId32: number, locale: CoachLocale): CoachReviewKey | null {
    const writer = this.deps.writer;
    if (!writer) return null;
    return {
      matchId,
      accountId32,
      model: writer.model,
      promptVersion: COACH_PROMPT_VERSION,
      locale,
    };
  }

  private async plus(userId: string): Promise<boolean> {
    try {
      return await this.deps.isPlus(userId);
    } catch (error) {
      this.deps.logger.warn("coach_plus_lookup_failed", { error });
      return false;
    }
  }

  /** The quota right now (Plus: unlimited). */
  async quota(userId: string, plus?: boolean): Promise<CoachQuota> {
    const isPlus = plus ?? (await this.plus(userId));
    if (isPlus) return coachQuota([], this.now(), true);
    const windowMs = this.deps.windowMs ?? COACH_QUOTA_WINDOW_MS;
    const now = this.now();
    const uses = await this.deps.usage.usesSince(userId, new Date(now.getTime() - windowMs));
    return coachQuota(uses, now, false, {
      limit: this.deps.freeReviews ?? COACH_FREE_REVIEWS,
      windowMs,
    });
  }

  /**
   * The coach card's starting state on a match page, for the player in it. The page already
   * has the match; nothing here calls the model.
   */
  async view(
    user: CoachUser,
    match: MatchDetail,
    locale: CoachLocale,
  ): Promise<CoachViewDto | null> {
    const me = match.players.find((p) => p.accountId32 === user.accountId32);
    if (!me) return null;
    const key = this.key(match.matchId, user.accountId32, locale);
    if (!key) return { status: "off" };
    const stored = await this.deps.reviews.get(key);
    if (!stored && !isParsed(match, me)) return { status: "unparsed" };
    const quota = toQuotaDto(await this.quota(user.id));
    if (stored) return { status: "ready", review: toReviewDto(stored), quota };
    return quota.remaining === 0 ? { status: "locked", quota } : { status: "available", quota };
  }

  /** Writes (or re-opens) the coach review of the player's own match. */
  async review(user: CoachUser, matchId: string, locale: CoachLocale): Promise<CoachResultDto> {
    const key = this.key(matchId, user.accountId32, locale);
    if (!key) {
      throw new AppError("upstream_unavailable", "The AI coach isn't set up on this server.", {
        reason: "not_configured",
      });
    }
    const stored = await this.deps.reviews.get(key);
    if (stored) {
      return {
        review: toReviewDto(stored),
        quota: toQuotaDto(await this.quota(user.id)),
        cached: true,
      };
    }

    const res = await this.deps.matches.match(matchId);
    if (!res.ok) {
      if (res.error.type === "not_found") throw new NotFoundError("Match not found");
      if (res.error.type === "rate_limited")
        throw new RateLimitedError("OpenDota is busy. Try again in a minute.");
      throw new UpstreamUnavailableError("OpenDota is unavailable right now.");
    }
    const match = res.value;
    const me = match.players.find((p) => p.accountId32 === user.accountId32);
    if (!me) throw new ForbiddenError("The coach only reviews your own matches.");
    if (!isParsed(match, me))
      throw new ConflictError("The coach needs this replay parsed first.", { reason: "unparsed" });

    const plus = await this.plus(user.id);
    const windowMs = this.deps.windowMs ?? COACH_QUOTA_WINDOW_MS;
    const limit = this.deps.freeReviews ?? COACH_FREE_REVIEWS;
    let hold: string | null = null;
    if (!plus) {
      const reserved = await this.deps.usage.reserve(user.id, {
        matchId,
        now: this.now(),
        limit,
        windowMs,
        holdMs: HOLD_MS,
      });
      if (!reserved.ok) {
        const quota = await this.quota(user.id, false);
        throw new AppError("rate_limited", "You've used this week's free coach review.", {
          reason: "quota",
          quota: toQuotaDto(quota),
        });
      }
      hold = reserved.id;
    }

    try {
      const sheet = await this.sheet(match, me);
      const points = await this.write(sheet, matchId, locale);
      const saved = await this.deps.reviews.save({
        ...key,
        userId: user.id,
        sheet,
        points,
        createdAt: this.now(),
      });
      if (hold) {
        await this.deps.usage.confirm(hold, this.now());
        hold = null;
      }
      await this.deps.used?.(user.id);
      this.deps.logger.info("coach_review_written", {
        matchId,
        accountId32: user.accountId32,
        plus,
        points: points.length,
      });
      return {
        review: toReviewDto(saved),
        quota: toQuotaDto(await this.quota(user.id, plus)),
        cached: false,
      };
    } finally {
      if (hold) await this.deps.usage.release(hold).catch(() => {});
    }
  }

  private async sheet(match: MatchDetail, me: MatchPlayer): Promise<CoachFactSheet> {
    const [heroes, items, timeline] = await Promise.all([
      this.deps.matches.heroMap(),
      this.deps.matches.itemMap(),
      this.deps.patches.getTimeline(),
    ]);
    const byKey = new Map([...items.values()].map((i) => [i.key, i]));
    const patch = timeline.ok ? assignPatch(match.startedAt, timeline.value).patch : null;
    return buildCoachFactSheet({
      match,
      player: me,
      heroName: (id) => heroes.get(id)?.name ?? `Hero #${id}`,
      items: byKey,
      patch,
    });
  }

  /**
   * Asks the model, checks the answer, and asks once more (with what was wrong) when the
   * answer fails the checks. Each call takes one unit of the daily budget first.
   */
  private async write(
    sheet: CoachFactSheet,
    matchId: string,
    locale: CoachLocale,
  ): Promise<CoachPoint[]> {
    const writer = this.deps.writer!;
    let problems: string[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (!(await this.deps.budget.take())) {
        throw new AppError("upstream_unavailable", "The coach is resting. Try again later.", {
          reason: "resting",
        });
      }
      const reply = await writer.write(sheet, { locale, problems });
      if (!reply.ok && reply.error.type === "unavailable") {
        this.deps.logger.warn("coach_model_unavailable", { matchId, cause: reply.error.cause });
        break;
      }
      if (reply.ok) {
        const parsed = CoachAnswerSchema.safeParse(reply.value);
        if (parsed.success) {
          const checked = checkCoachPoints(
            parsed.data.points.map((p) => ({
              kind: p.kind,
              title: p.title,
              detail: p.detail,
              factKeys: p.facts,
            })),
            sheet,
          );
          if (checked.ok) return checked.value;
          problems = checked.error;
        } else {
          problems = ["The answer didn't match the JSON shape asked for."];
        }
      } else {
        problems = ["The answer wasn't valid JSON."];
      }
      this.deps.logger.warn("coach_answer_rejected", { matchId, attempt, problems });
    }
    throw new AppError("upstream_unavailable", "The coach couldn't write this review.", {
      reason: "failed",
    });
  }

  async exportMyData(owner: DataOwner) {
    const [reviews, uses, scheduled] = await Promise.all([
      this.deps.reviews.exportForOwner(owner),
      this.deps.usage.exportForOwner(owner),
      this.deps.autoReviews?.exportForOwner(owner) ?? Promise.resolve([]),
    ]);
    return { coachReviews: reviews, coachReviewUses: uses, coachAutoReviews: scheduled };
  }

  async deleteMyData(owner: DataOwner) {
    const [reviews, uses, scheduled] = await Promise.all([
      this.deps.reviews.deleteForOwner(owner),
      this.deps.usage.deleteForOwner(owner),
      this.deps.autoReviews?.deleteForOwner(owner) ?? Promise.resolve(0),
    ]);
    return { coachReviews: reviews, coachReviewUses: uses, coachAutoReviews: scheduled };
  }
}

/** The coach needs the parsed replay (laning and items) for this player. */
export function isParsed(match: MatchDetail, me: MatchPlayer): boolean {
  return match.parsed && me.laning !== null;
}

export type { StoredCoachReview };
