import type { ProviderError } from "../../matches.ports";

export type SyncError =
  | { type: "sync_in_progress" }
  | { type: "cooldown"; retryAt: Date }
  | { type: "provider"; error: ProviderError };

export interface SyncSummary {
  fetched: number;
  inserted: number;
  updated: number;
  rejected: number;
  backfillComplete: boolean;
  /** True when this sync asked the upstream to fetch the player's history from Steam. */
  historyRefreshRequested: boolean;
}
