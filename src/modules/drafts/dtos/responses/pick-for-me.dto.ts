import type { PickSuggestion } from "../../domain/pick-for-me";

/** POST /api/v1/drafts/pick-for-me. */
export interface PickForMeResult {
  suggestions: PickSuggestion[];
  /** Further suggestions Plus would show. */
  locked: number;
  plan: "plus" | "free";
  /** Heroes you've played enough to suggest. */
  poolSize: number;
  /** Whether high-rank matchups and position shares were available for this answer. */
  sources: { highRank: boolean; positions: boolean };
}
