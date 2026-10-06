/** What one run of the daily match sync did (shown on the admin page). */
export interface MatchSyncRunDto {
  accounts: number;
  synced: number;
  backfilling: number;
  failed: Array<{ accountId32: number; outcome: string }>;
  skipped: number;
  medals: number;
  durationMs: number;
}

export interface PatchRefreshDto {
  outcomes: Array<{ outcome: string }>;
}
