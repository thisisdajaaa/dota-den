import type { ReplaySummary } from "./domain/replay-summary";

export const REPLAY_READS_COLLECTION = "match_replay_reads";
/** Replay summaries are kept a year (a parsed match never changes). */
export const REPLAY_READS_KEEP_S = 365 * 24 * 3600;

export interface ReplayReadDocument extends ReplaySummary {
  /** `${matchId}:${accountId32}` */
  _id: string;
  accountId32: number;
  computedAt: Date;
}

export const replayReadId = (matchId: string, accountId32: number) => `${matchId}:${accountId32}`;
