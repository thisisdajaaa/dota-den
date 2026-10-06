import type { DraftRecord } from "../../domain/draft-record";

export interface DraftRecordView {
  record: DraftRecord;
  /** Recent ranked games with full lineups. */
  total: number;
  accuracy: number;
}
