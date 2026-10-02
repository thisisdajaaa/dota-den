import type { RankedWeekRow } from "../domain/ranked-week";
import { z } from "zod";
import type { Period } from "../domain/period";
import type {
  BoardKind,
  ChallengeStanding,
  DraftStanding,
  RoomStanding,
  Scope,
} from "../domain/ranking";

/** POST /api/v1/drafts/results */
export const DraftResultInputSchema = z
  .object({
    snapshot: z.string().min(1).max(2_000),
    aiSide: z.enum(["radiant", "dire"]).nullable(),
  })
  .strict();

/** Draft results a player may submit per window (a real draft takes minutes). */
export const DRAFT_RESULTS_PER_WINDOW = 10;
export const DRAFT_RESULTS_WINDOW_MS = 10 * 60_000;

/** The saved streak returned with a graded answer when signed in. */
export interface ChallengeProgressDto {
  /** False when this puzzle was answered before: nothing changed. */
  counted: boolean;
  streak: number;
  best: number;
}

/** Rows shown per board; the viewer's own row is added below the cut when needed. */
export const BOARD_ROW_LIMIT = 50;

/** Who a row is: public profile details only (no Dota Den user ids leave the server). */
export interface PlayerView {
  accountId32: number;
  name: string;
  avatarUrl: string | null;
  rankTier: number | null;
  leaderboardRank: number | null;
  isYou: boolean;
}

export type RowView<S> = { rank: number; player: PlayerView; stats: Omit<S, "userId"> };

interface BoardBase {
  scope: Scope;
  period: Period;
  /** Start of the period (null for all time). */
  since: Date | null;
  /** Players with activity on this board (in scope). */
  total: number;
  /** Friends scope: friends (not you) who have Dota Den accounts. Null for everyone. */
  friendsWithAccounts: number | null;
  /** Friends scope: some friend sources (e.g. OpenDota teammates) couldn't be loaded. */
  friendsIncomplete: boolean;
}

export type BoardView =
  | (BoardBase & {
      kind: "drafts";
      rows: RowView<DraftStanding>[];
      youBelowCut: RowView<DraftStanding> | null;
    })
  | (BoardBase & {
      kind: "challenges";
      rows: RowView<ChallengeStanding>[];
      youBelowCut: RowView<ChallengeStanding> | null;
    })
  | (BoardBase & {
      kind: "rooms";
      rows: RowView<RoomStanding>[];
      youBelowCut: RowView<RoomStanding> | null;
    });

/** Your place on one board among your friends, all time. */
export interface StandingView {
  kind: BoardKind;
  /** null when you haven't played this yet. */
  rank: number | null;
  /** Players on the board (you and friends with activity). */
  players: number;
  /** The board's headline number for you (drafts, correct answers or room drafts). */
  value: number;
}

/** Ranked this week for you and your friends (see domain/ranked-week). */
export interface RankedWeekView {
  rows: Array<RankedWeekRow & { name: string | null; avatarUrl: string | null; you: boolean }>;
  /** Players who didn't play ranked this week. */
  idle: number;
  /** Friends we couldn't read (OpenDota failed or their data is private). */
  unknown: number;
  friendsIncomplete: boolean;
}
