import type { DraftHistoryRecord, ReportedResult } from "../domain/draft-history";

export interface HistoryOpponent {
  accountId32: number;
  name: string;
  avatarUrl: string | null;
  drafts: number;
}

export interface DraftHistoryRepository {
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
}
