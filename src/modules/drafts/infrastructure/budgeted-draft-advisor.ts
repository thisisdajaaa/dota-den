import { err, type Result } from "@/common/result";
import type {
  AdvisorError,
  AdvisorRequest,
  DraftAdvisor,
  DraftReviewer,
  ReviewRequest,
} from "../drafts.ports";

/**
 * The AI captain and reviewer behind a daily call budget. Anyone can play a practice draft
 * signed out, so each model call is counted; once the day's budget is spent the advisor
 * answers "unavailable" without calling the model, and the captain plays its data-driven
 * pick instead (the review says it's unavailable).
 */
export class BudgetedDraftAdvisor implements DraftAdvisor, DraftReviewer {
  constructor(
    private readonly inner: DraftAdvisor & DraftReviewer,
    private readonly budget: { take(): Promise<boolean> },
  ) {}

  get model(): string {
    return this.inner.model;
  }

  async suggest(
    req: AdvisorRequest,
  ): Promise<Result<{ heroId: number; reason: string }, AdvisorError>> {
    if (!(await this.budget.take())) return err({ type: "unavailable", cause: "daily budget" });
    return this.inner.suggest(req);
  }

  async review(req: ReviewRequest): Promise<Result<unknown, AdvisorError>> {
    if (!(await this.budget.take())) return err({ type: "unavailable", cause: "daily budget" });
    return this.inner.review(req);
  }
}
