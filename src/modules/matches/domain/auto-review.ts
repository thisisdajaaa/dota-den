/**
 * Plus auto post-game reviews (pure rules). After a sync finds new ranked games, the AI coach
 * reviews the newest few once their replays are parsed. Parsing takes minutes, so a review is
 * attempted later and retried with growing waits, then given up.
 */

/** Newest ranked games reviewed per sync: the AI budget is shared, so only the latest ones. */
export const AUTO_REVIEW_PER_SYNC = 2;
/** Games older than this when the sync finds them are old news: not reviewed automatically. */
export const AUTO_REVIEW_MAX_AGE_MS = 24 * 3_600_000;
/** A game is scheduled once in this long, however many syncs see it. */
export const AUTO_REVIEW_CLAIM_MS = 3 * 24 * 3_600_000;
/** Wait before the first attempt (an already-parsed replay is reviewed after this too). */
export const AUTO_REVIEW_FIRST_DELAY_SEC = 120;
/**
 * Waits before each retry while the replay isn't parsed yet (or OpenDota is busy): about two
 * hours in all, after which OpenDota's parse is unlikely to come.
 */
export const AUTO_REVIEW_RETRY_DELAYS_SEC = [300, 600, 1200, 1800, 2700] as const;

/** The wait before the attempt after `attempt`, or null when it's time to give up. */
export function nextRetryDelaySec(attempt: number): number | null {
  return AUTO_REVIEW_RETRY_DELAYS_SEC[attempt] ?? null;
}

/** What one attempt did (for logs and tests). */
export type AutoReviewOutcome =
  | "written"
  | "already_written"
  | "retry_later"
  | "gave_up"
  | "not_plus"
  | "turned_off"
  | "no_user"
  | "budget_spent"
  | "failed";
