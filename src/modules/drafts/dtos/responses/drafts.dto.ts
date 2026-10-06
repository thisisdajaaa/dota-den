import type { AnswerError, PuzzleError } from "../../domain/challenges";
import type { DraftReport } from "../../domain/draft-report";
import type { DraftReview } from "../../domain/draft-review";
import type { DraftRoom, RoomCaptain } from "../../domain/draft-room";
import type { ScoringHero } from "../../domain/draft-scoring";
import type { DraftError, Side } from "../../domain/draft-state";

export type AiHero = ScoringHero;

export type ReviewError =
  | { type: "invalid_snapshot" }
  | { type: "draft_incomplete" }
  | { type: "not_configured" }
  | { type: "unavailable" };

export interface ReviewResult {
  review: DraftReview;
  model: string;
  /** The data report card, and the same card with the AI's nudges applied. */
  report: DraftReport;
  adjusted: DraftReport;
}

export interface ReviewCache {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
}

export type AiMoveError =
  | { type: "invalid_snapshot" }
  | { type: "not_ai_turn" }
  | { type: "draft_complete" }
  | { type: "no_heroes" };

export interface AiMove {
  action: "pick" | "ban";
  side: Side;
  heroId: number;
  reason: string;
  /** "model" = language model chose from the shortlist; "heuristic" = top-scored candidate. */
  source: "model" | "heuristic";
  model: string | null;
}

export type GradeError = PuzzleError | { type: "illegal_answer"; cause: AnswerError };

export type HistoryError =
  { type: "not_found" } | { type: "not_captain" } | { type: "not_completed" };

export interface HistoryActor {
  userId: string;
  name: string;
}

export type RoomError =
  | { type: "not_found" }
  | { type: "disabled" }
  | { type: "too_many_rooms" }
  | { type: "invalid_options" }
  | { type: "seat_taken" }
  | { type: "already_seated" }
  | { type: "not_host" }
  | { type: "not_captain" }
  | { type: "not_your_turn" }
  | { type: "wrong_status"; status: DraftRoom["status"] }
  | { type: "seats_empty" }
  | { type: "stale"; room: DraftRoom }
  | { type: "illegal"; reason: DraftError["type"] };

export interface Actor {
  userId: string;
  captain: RoomCaptain;
}

export interface CreateRoomOptions {
  rulesetId: string;
  firstSide: Side;
  timerEnabled: boolean;
  /** The side the host sits on. */
  hostSide: Side;
}

export type RoomAction =
  { type: "pick" | "ban"; heroId: number } | { type: "pause" } | { type: "resume" };
