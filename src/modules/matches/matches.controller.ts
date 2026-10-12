import "server-only";
import { z } from "zod";
import {
  AppError,
  ConflictError,
  RateLimitedError,
  UpstreamUnavailableError,
} from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { requestId } from "@/common/http/http";
import { ServiceResponse } from "@/common/http/service-response";
import type { Logger } from "@/common/logging/logger";
import { requireUser } from "@/modules/identity";
import type { MatchSyncService } from "./services/match-sync.service";
import type { MatchesService } from "./services/matches.service";

const MatchParams = z.object({ matchId: z.string().regex(/^\d{6,20}$/, "Invalid match id") });

export class MatchesController {
  constructor(
    private readonly deps: {
      sync: MatchSyncService;
      matches: MatchesService;
      /** Continue a long history in the background (durable queue only). */
      continueBackfill: (accountId32: number) => Promise<void>;
      /** Upstream failures are recorded for the admin page (logs are short-lived on Vercel). */
      reportError: (input: { message: string; path: string }) => Promise<void>;
      /**
       * New matches were imported: work that may follow (the Discord feed). Runs after the
       * response is sent, so it never slows the sync down.
       */
      onNewMatches?: (accountId32: number) => void;
      logger: Pick<Logger, "info" | "warn">;
    },
  ) {}

  /** POST /api/v1/me/matches/sync: import your matches. Cooldown and a per-account lock apply. */
  sync = handler({ guard: requireUser }, async ({ req, user }) => {
    const { accountId32 } = user;
    const started = Date.now();
    const result = await this.deps.sync.sync(accountId32);
    const log = { requestId: requestId(req), accountId32, durationMs: Date.now() - started };
    if (result.ok) {
      this.deps.logger.info("match_sync_completed", { ...log, ...result.value });
      if (result.value.inserted > 0) this.deps.onNewMatches?.(accountId32);
      if (!result.value.backfillComplete) {
        await this.deps
          .continueBackfill(accountId32)
          .catch((error: unknown) =>
            this.deps.logger.warn("match_backfill_enqueue_failed", { ...log, error }),
          );
      }
      return ServiceResponse.success(result.value, "Matches synced");
    }

    const error = result.error;
    this.deps.logger.warn("match_sync_rejected", { ...log, reason: error.type });
    switch (error.type) {
      case "cooldown":
        throw new AppError(
          "rate_limited",
          "Matches were synced recently.",
          { retryAt: error.retryAt.toISOString() },
          Math.ceil((error.retryAt.getTime() - Date.now()) / 1000),
        );
      case "sync_in_progress":
        throw new ConflictError("A sync is already running for this account.");
      case "provider": {
        await this.deps.reportError({
          message: `Match sync failed: ${error.error.type}`,
          path: "/api/v1/me/matches/sync",
        });
        if (error.error.type === "rate_limited") {
          // Tell the page when to try again, so it can wait it out instead of giving up.
          const waitMs = Math.min(Math.max(error.error.retryAfterMs ?? 60_000, 5_000), 5 * 60_000);
          throw new AppError("rate_limited", "OpenDota is busy right now. Try again shortly.", {
            reason: "upstream_rate_limited",
            retryAt: new Date(Date.now() + waitMs).toISOString(),
          });
        }
        throw new AppError("upstream_unavailable", "OpenDota is unavailable right now.", {
          reason: error.error.type,
        });
      }
    }
  });

  /** POST /api/v1/matches/:matchId/parse: ask OpenDota to parse the replay. */
  requestParse = handler(
    {
      rateLimit: { name: "match-parse", limit: 6, windowMs: 10 * 60_000 },
      params: MatchParams,
    },
    async ({ params }) => {
      const res = await this.deps.matches.requestParse(params.matchId);
      if (!res.ok) {
        if (res.error.type === "rate_limited")
          throw new RateLimitedError("OpenDota is busy. Try again in a minute.");
        throw new UpstreamUnavailableError("OpenDota couldn't take the request right now.");
      }
      return ServiceResponse.success({ requested: true }, "Parse requested", 202);
    },
  );
}
