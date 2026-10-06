import "server-only";
import {
  AppError,
  ConflictError,
  UpstreamUnavailableError,
  ValidationError,
} from "@/common/errors/app-error";
import { apiLimit } from "@/common/http/api-limits";
import { handler } from "@/common/http/controller";
import { requestId } from "@/common/http/http";
import { ServiceResponse } from "@/common/http/service-response";
import type { Logger } from "@/common/logging/logger";
import { optionalUser } from "@/modules/identity";
import type { Grade } from "./domain/challenges";
import { decodeSnapshot } from "./domain/snapshot";
import {
  AiMoveSchema,
  GradeSchema,
  OutlookSchema,
  SuggestionsSchema,
} from "./schemas/draft-requests.schema";
import { toRoleMaps } from "./schemas/roles.schema";
import type { AiOpponentService } from "./services/ai-opponent.service";
import type { ChallengeService } from "./services/challenge.service";

const limit = (name: Parameters<typeof apiLimit>[0], bucket: string) => () => ({
  name: bucket,
  ...apiLimit(name),
  byIp: true,
});

function snapshotOrThrow(encoded: string) {
  const snapshot = decodeSnapshot(encoded);
  if (!snapshot.ok) throw new ValidationError("Invalid draft");
  return snapshot.value;
}

/** Saved progress for a graded challenge answer, when signed in. */
export interface ChallengeProgress {
  counted: boolean;
  streak: number;
  best: number;
}

/** The AI captain, draft suggestions, outlook and review, and draft challenges. */
export class DraftsController {
  constructor(
    private readonly deps: {
      ai: () => Promise<AiOpponentService>;
      challenges: () => Promise<ChallengeService>;
      /** Record a signed-in player's challenge answer (leaderboards); never fails the grade. */
      recordChallenge: (
        userId: string,
        answer: { type: string; seed: string; grade: Grade },
      ) => Promise<ChallengeProgress | null>;
      logger: Pick<Logger, "info">;
    },
  ) {}

  /** POST /api/v1/drafts/ai-move: the AI captain's next pick or ban in a practice draft. */
  aiMove = handler(
    {
      rateLimit: limit("draftAiMove", "ai-move"),
      body: AiMoveSchema,
      invalidMessage: "Invalid request",
    },
    async ({ req, body }) => {
      const snapshot = snapshotOrThrow(body.snapshot);
      const started = Date.now();
      const res = await (await this.deps.ai()).move(snapshot, body.aiSide);
      if (!res.ok) {
        const message = `Can't make an AI move: ${res.error.type.replaceAll("_", " ")}`;
        throw res.error.type === "invalid_snapshot"
          ? new ValidationError(message)
          : new ConflictError(message);
      }
      this.deps.logger.info("draft_ai_move", {
        requestId: requestId(req),
        source: res.value.source,
        model: res.value.model,
        action: res.value.action,
        durationMs: Date.now() - started,
      });
      return ServiceResponse.success(res.value);
    },
  );

  /** POST /api/v1/drafts/suggestions: data-backed picks/bans for the side to move. */
  suggestions = handler(
    {
      rateLimit: limit("draftSuggestions", "draft-suggest"),
      body: SuggestionsSchema,
      invalidMessage: "Invalid request",
    },
    async ({ body }) => {
      const snapshot = snapshotOrThrow(body.snapshot);
      const res = await (
        await this.deps.ai()
      ).suggestions(snapshot, body.side, 5, toRoleMaps(body.roles));
      if (!res.ok) {
        const message = `No suggestions: ${res.error.type.replaceAll("_", " ")}`;
        throw res.error.type === "invalid_snapshot"
          ? new ValidationError(message)
          : new ConflictError(message);
      }
      return ServiceResponse.success({
        action: res.value.action,
        situation: res.value.situation,
        situationPhrase: res.value.situationPhrase,
        candidates: res.value.candidates.map((c) => ({
          heroId: c.heroId,
          name: c.name,
          role: c.role,
          position: c.position,
          facts: c.facts,
          factPhrases: c.factPhrases,
        })),
      });
    },
  );

  /** POST /api/v1/drafts/outlook: which side the draft favours so far (an estimate). */
  outlook = handler(
    {
      rateLimit: limit("draftOutlook", "draft-outlook"),
      body: OutlookSchema,
      invalidMessage: "Invalid request",
    },
    async ({ body }) => {
      const snapshot = snapshotOrThrow(body.snapshot);
      const res = await (await this.deps.ai()).outlook(snapshot, toRoleMaps(body.roles));
      if (!res.ok) throw new ValidationError("Invalid draft");
      return ServiceResponse.success(res.value);
    },
  );

  /** POST /api/v1/drafts/review: an AI review of a finished draft (a language model call). */
  review = handler(
    {
      rateLimit: limit("draftReview", "draft-review"),
      body: OutlookSchema,
      invalidMessage: "Invalid request",
    },
    async ({ body }) => {
      const snapshot = snapshotOrThrow(body.snapshot);
      const res = await (await this.deps.ai()).review(snapshot, toRoleMaps(body.roles));
      if (!res.ok) {
        switch (res.error.type) {
          case "invalid_snapshot":
            throw new ValidationError("Invalid draft");
          case "draft_incomplete":
            throw new ConflictError("Finish the draft first.");
          case "not_configured":
            throw new UpstreamUnavailableError("The AI review isn't set up on this server.");
          case "unavailable":
            throw new UpstreamUnavailableError(
              "The AI review is unavailable right now. Try again.",
            );
        }
      }
      return ServiceResponse.success(res.value);
    },
  );

  /**
   * POST /api/v1/drafts/challenges/grade: the client names the puzzle ({type, seed}) and its
   * answer; the server rebuilds the position, checks the answer is legal, then grades it.
   * Signed in, the first answer to each puzzle is recorded and `saved` carries the streak.
   */
  gradeChallenge = handler(
    {
      guard: optionalUser,
      rateLimit: limit("draftChallenge", "draft-challenge"),
      body: GradeSchema,
      invalidMessage: "Invalid request",
    },
    async ({ user, body }) => {
      const { type, seed, heroIds } = body;
      const res = await (await this.deps.challenges()).grade(type, seed, heroIds);
      if (!res.ok) {
        switch (res.error.type) {
          case "not_enough_heroes":
            throw new UpstreamUnavailableError("The hero list is unavailable right now.");
          case "illegal_answer": {
            const cause = res.error.cause;
            const message =
              cause.type === "wrong_count"
                ? `Choose exactly ${cause.expected} hero${cause.expected === 1 ? "" : "es"}.`
                : cause.type === "duplicate"
                  ? "Choose different heroes."
                  : "That hero isn't available in this puzzle.";
            throw new ValidationError(message, { reason: cause.type });
          }
          default:
            throw new AppError("bad_request", "Invalid puzzle");
        }
      }
      const result = res.value.result;
      const saved = user
        ? await this.deps.recordChallenge(user.id, { type, seed, grade: result.grade })
        : null;
      return ServiceResponse.success({ type, seed, ...result, saved });
    },
  );
}
