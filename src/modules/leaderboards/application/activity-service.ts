import { err, ok, type Result } from "@/modules/shared/domain/result";
import {
  isCorrectGrade,
  type ActivitySide,
  type ChallengeGrade,
  type ChallengeStreak,
  type DraftMode,
} from "../domain/activity";
import { draftScoreFor, type DraftGrade, type DraftScore } from "../domain/draft-score";
import type { ActivityRepository, DraftReferee, RefereeError } from "./ports";

export interface ChallengeRecord {
  /** False when the player had already answered this puzzle: nothing changed. */
  counted: boolean;
  streak: ChallengeStreak;
}

export type DraftRecordError = RefereeError | { type: "not_completed" };

export interface DraftRecord {
  /** False when this player already submitted the same finished draft. */
  counted: boolean;
  mode: DraftMode;
  side: ActivitySide | null;
  score: number | null;
  grade: DraftGrade | null;
}

/** Records what signed-in players do, for the leaderboards. */
export class ActivityService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      repo: ActivityRepository;
      referee: DraftReferee;
      /** Hex digest of a string (SHA-256 in production). */
      hash: (text: string) => string;
      now?: () => Date;
      /** Called when the draft score can't be computed; the draft still counts. */
      onScoreError?: (error: unknown) => void;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Record a graded answer. Only the first answer to a puzzle counts, for the leaderboard
   * and the streak; a repeat returns the current streak unchanged.
   */
  async recordChallenge(
    userId: string,
    answer: { type: string; seed: string; grade: ChallengeGrade },
  ): Promise<ChallengeRecord> {
    const at = this.now();
    const correct = isCorrectGrade(answer.grade);
    const inserted = await this.deps.repo.insertAttempt({ userId, ...answer, correct, at });
    if (inserted === "duplicate") {
      return { counted: false, streak: await this.deps.repo.streakOf(userId) };
    }
    return { counted: true, streak: await this.deps.repo.applyToStreak(userId, correct, at) };
  }

  challengeStreak(userId: string): Promise<ChallengeStreak> {
    return this.deps.repo.streakOf(userId);
  }

  /**
   * Record a finished draft against the AI captain (`aiSide` set) or in practice (null).
   * The draft is replayed and must be complete. The score is your side's draft score;
   * practice drafts have no side and so no score.
   */
  async recordDraft(
    userId: string,
    input: { snapshot: string; aiSide: ActivitySide | null },
  ): Promise<Result<DraftRecord, DraftRecordError>> {
    const replayed = await this.deps.referee.replay(input.snapshot);
    if (!replayed.ok) return replayed;
    const { canonical, completed, rulesetId, rulesetVersion } = replayed.value;
    if (!completed) return err({ type: "not_completed" });

    const mode: DraftMode = input.aiSide === null ? "practice" : "ai";
    const side: ActivitySide | null =
      input.aiSide === null ? null : input.aiSide === "radiant" ? "dire" : "radiant";
    let scored: DraftScore | null = null;
    if (side !== null) {
      try {
        const outlook = await this.deps.referee.outlook(canonical);
        scored = outlook ? draftScoreFor(outlook, side) : null;
      } catch (error) {
        this.deps.onScoreError?.(error);
      }
    }
    const inserted = await this.deps.repo.insertDraft({
      userId,
      mode,
      side,
      score: scored?.score ?? null,
      grade: scored?.grade ?? null,
      snapshotHash: this.deps.hash(canonical),
      rulesetId,
      rulesetVersion,
      completedAt: this.now(),
    });
    return ok({
      counted: inserted === "inserted",
      mode,
      side,
      score: scored?.score ?? null,
      grade: scored?.grade ?? null,
    });
  }
}
