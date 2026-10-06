import type { HeadToHead, ReportedWinner, ViewerOutcome } from "../../domain/draft-history";
import type { Side } from "../../domain/draft-state";

/** Captain details any participant may see. User ids stay server-side. */
export interface PublicCaptain {
  name: string;
  avatarUrl: string | null;
  accountId32: number;
}

/** The self-reported real-game result for one room, as the room page shows it. */
export interface RoomResultView {
  /** False until the finished draft has been saved to history. */
  recorded: boolean;
  winner: ReportedWinner | null;
  setByName: string | null;
  setAt: string | null;
  /** Only the two captains may report or change the result. */
  canReport: boolean;
}

export interface HistoryEntryView {
  roomId: string;
  completedAt: string;
  rulesetId: string;
  rulesetName: string;
  yourSide: Side;
  firstSide: Side;
  you: PublicCaptain;
  opponent: PublicCaptain;
  sides: Record<Side, { picks: number[]; bans: number[] }>;
  snapshot: string;
  isRematch: boolean;
  result: {
    winner: ReportedWinner;
    outcome: ViewerOutcome;
    setByName: string;
    setByYou: boolean;
    setAt: string;
  } | null;
  /** The live room still exists (rooms expire a day after the last move). */
  roomAvailable: boolean;
}

export interface HistoryPageView {
  items: HistoryEntryView[];
  total: number;
  page: number;
  pageCount: number;
}

export interface HeadToHeadView extends HeadToHead {
  friend: PublicCaptain;
  /** True when the summary had to stop at the newest drafts (see HEAD_TO_HEAD_CAP). */
  truncated: boolean;
}
