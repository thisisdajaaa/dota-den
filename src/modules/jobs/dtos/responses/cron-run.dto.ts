/** What one run of the daily match sync did (shown on the admin page). */
export interface MatchSyncRunDto {
  accounts: number;
  synced: number;
  backfilling: number;
  failed: Array<{ accountId32: number; outcome: string }>;
  skipped: number;
  medals: number;
  /** Discord feed posts after the sync; null when the run had no time left or none are set up. */
  discord: {
    feeds: number;
    posted: number;
    failed: number;
    rateLimited: boolean;
    stoppedEarly: boolean;
  } | null;
  /** Notifications sent after the sync; null when the run had no time left or none are set up. */
  notifications: {
    users: number;
    sessionRecaps: number;
    weeklyRecaps: number;
    patchHeroes: number;
    failed: number;
    stoppedEarly: boolean;
  } | null;
  /** Weekly emails sent after the notifications; null when no time was left or email is off. */
  digests: {
    users: number;
    sent: number;
    skipped: number;
    failed: number;
    stoppedEarly: boolean;
  } | null;
  durationMs: number;
}

export interface PatchRefreshDto {
  outcomes: Array<{ outcome: string }>;
}
