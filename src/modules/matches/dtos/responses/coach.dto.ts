import type { CoachFact, CoachMissing } from "../../domain/coach-facts";
import { resolvePoints, type CoachQuota, type ResolvedCoachPoint } from "../../domain/coach-review";
import type { StoredCoachReview } from "../../matches.ports";

export interface CoachQuotaDto {
  plan: "plus" | "free";
  limit: number | null;
  remaining: number | null;
  resetsAt: string | null;
}

export interface CoachReviewDto {
  matchId: string;
  heroId: number;
  model: string;
  createdAt: string;
  points: ResolvedCoachPoint[];
  /** Data this match doesn't have (the UI lists it; the coach was told). */
  missing: CoachMissing[];
}

/**
 * What the match page's coach card starts from. `off`: no model on this server; `unparsed`:
 * the coach needs the replay parsed first; `ready`: a stored review; `available`: one can be
 * written now; `locked`: the free review for this week is used.
 */
export type CoachViewDto =
  | { status: "off" }
  | { status: "unparsed" }
  | { status: "ready"; review: CoachReviewDto; quota: CoachQuotaDto }
  | { status: "available"; quota: CoachQuotaDto }
  | { status: "locked"; quota: CoachQuotaDto };

/** POST /api/v1/matches/:matchId/coach */
export interface CoachResultDto {
  review: CoachReviewDto;
  quota: CoachQuotaDto;
  /** True when it was already written (nothing counted). */
  cached: boolean;
}

export const toQuotaDto = (q: CoachQuota): CoachQuotaDto => ({
  plan: q.plan,
  limit: q.limit,
  remaining: q.remaining,
  resetsAt: q.resetsAt?.toISOString() ?? null,
});

export const toReviewDto = (r: StoredCoachReview): CoachReviewDto => ({
  matchId: r.matchId,
  heroId: r.sheet.heroId,
  model: r.model,
  createdAt: r.createdAt.toISOString(),
  points: resolvePoints(r.points, r.sheet),
  missing: r.sheet.missing,
});

export type { CoachFact, CoachMissing, ResolvedCoachPoint };
