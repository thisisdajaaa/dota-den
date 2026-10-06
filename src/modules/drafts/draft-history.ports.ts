import type { DraftHistoryRecord, ReportedResult } from "./domain/draft-history";

export interface HistoryOpponent {
  accountId32: number;
  name: string;
  avatarUrl: string | null;
  drafts: number;
}

/** Room drafts one captain finished, with the self-reported results from their side. */
export interface CaptainTotals {
  userId: string;
  drafts: number;
  /** Only drafts where a captain reported the winner count as wins or losses. */
  wins: number;
  losses: number;
}

export interface DraftHistoryPort {
  /**
   * Store the record unless one already exists for this room (unique on roomId).
   * Safe to call any number of times, concurrently.
   */
  insertOnce(record: DraftHistoryRecord): Promise<"inserted" | "duplicate">;
  get(roomId: string): Promise<DraftHistoryRecord | null>;
  /** Set the reported result iff `captainUserId` is one of the two captains. */
  setResult(roomId: string, captainUserId: string, result: ReportedResult): Promise<boolean>;
  /** A captain's drafts, newest first, optionally only those with one friend. */
  listForCaptain(
    userId: string,
    opts: { friendAccountId: number | null; skip: number; limit: number },
  ): Promise<{ items: DraftHistoryRecord[]; total: number }>;
  /** People this captain has drafted against, most recent first (latest name/avatar). */
  opponents(userId: string, limit: number): Promise<HistoryOpponent[]>;
  /**
   * Per-captain totals of finished drafts since a date (null = all time), optionally only
   * for some captains (null = everyone).
   */
  captainTotals(query: {
    since: Date | null;
    userIds: readonly string[] | null;
  }): Promise<CaptainTotals[]>;
}
