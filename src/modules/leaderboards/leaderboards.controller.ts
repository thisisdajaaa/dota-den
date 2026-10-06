import "server-only";
import { UpstreamUnavailableError, ValidationError } from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import {
  DRAFT_RESULTS_PER_WINDOW,
  DRAFT_RESULTS_WINDOW_MS,
  DraftResultInputSchema,
} from "./schemas/leaderboards.schema";
import type { ActivityService } from "./services/activity.service";

export class LeaderboardsController {
  constructor(private readonly deps: { activity: ActivityService }) {}

  /**
   * POST /api/v1/drafts/results: record a finished draft against the AI captain (`aiSide`)
   * or in practice (`aiSide: null`). The draft is replayed and must be complete; the same
   * draft counts once per player (201 when newly counted, 200 with `counted: false`).
   */
  recordDraft = handler(
    {
      guard: requireUser,
      rateLimit: {
        name: "draft-results",
        limit: DRAFT_RESULTS_PER_WINDOW,
        windowMs: DRAFT_RESULTS_WINDOW_MS,
      },
      body: DraftResultInputSchema,
      invalidMessage: "Invalid request",
    },
    async ({ user, body }) => {
      const res = await this.deps.activity.recordDraft(user.id, body);
      if (!res.ok) {
        switch (res.error.type) {
          case "heroes_unavailable":
            throw new UpstreamUnavailableError("The hero list is unavailable right now.");
          case "not_completed":
            throw new ValidationError("Only finished drafts count.", { reason: "not_completed" });
          default:
            throw new ValidationError("Invalid draft", { reason: "invalid_snapshot" });
        }
      }
      const out = res.value.counted
        ? ServiceResponse.created(res.value, "Draft counted")
        : ServiceResponse.success(res.value, "Already counted");
      return out.withHeaders({ "cache-control": "private, no-store" });
    },
  );
}
