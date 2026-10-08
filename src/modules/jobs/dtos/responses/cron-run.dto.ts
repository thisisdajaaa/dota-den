/** What one run of the daily match sync did (shown on the admin page). */
export interface MatchSyncRunDto {
  accounts: number;
  synced: number;
  backfilling: number;
  failed: Array<{ accountId32: number; outcome: string }>;
  skipped: number;
  medals: number;
  /** Notifications sent after the sync; null when the run had no time left or none are set up. */
  notifications: {
    users: number;
    sessionRecaps: number;
    weeklyRecaps: number;
    patchHeroes: number;
    failed: number;
    stoppedEarly: boolean;
  } | null;
  durationMs: number;
}

export interface PatchRefreshDto {
  outcomes: Array<{ outcome: string }>;
}
