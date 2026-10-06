import { NextResponse, type NextRequest } from "next/server";
import { apiError, isSameOrigin, requestId } from "@/common/http/http";
import { logger } from "@/common/logging/logger";
import { errorsService } from "@/modules/errors";
import { getAuthService, SESSION_COOKIE } from "@/modules/identity/composition";
import { enqueueMatchBackfill } from "@/modules/jobs/composition";
import { getMatchSyncService } from "@/modules/matches/composition";

/** Sync the signed-in user's own matches from OpenDota. Cooldown and per-account lock apply. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const auth = await getAuthService();
  const session = await auth.resolveSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return apiError("unauthorized", "Not signed in");

  const { accountId32 } = session.user;
  const service = await getMatchSyncService();
  const started = Date.now();
  const result = await service.sync(accountId32);
  const log = { requestId: requestId(req), accountId32, durationMs: Date.now() - started };

  if (result.ok) {
    logger.info("match_sync_completed", { ...log, ...result.value });
    // With a durable queue, the rest of a long history keeps importing in the background.
    if (!result.value.backfillComplete) {
      await enqueueMatchBackfill(accountId32).catch((error: unknown) =>
        logger.warn("match_backfill_enqueue_failed", { ...log, error }),
      );
    }
    return NextResponse.json(result.value);
  }

  const error = result.error;
  logger.warn("match_sync_rejected", { ...log, reason: error.type });
  switch (error.type) {
    case "cooldown": {
      const res = apiError("rate_limited", "Matches were synced recently.", {
        retryAt: error.retryAt.toISOString(),
      });
      res.headers.set(
        "retry-after",
        String(Math.ceil((error.retryAt.getTime() - Date.now()) / 1000)),
      );
      return res;
    }
    case "sync_in_progress":
      return apiError("conflict", "A sync is already running for this account.");
    case "provider": {
      // Not a bug, but worth seeing on the admin page (logs are short-lived on Vercel).
      await errorsService.record({
        source: "server",
        kind: "sync",
        message: `Match sync failed: ${error.error.type}`,
        path: "/api/v1/me/matches/sync",
      });
      if (error.error.type === "rate_limited") {
        // Tell the page when to try again, so it can wait it out instead of giving up.
        const waitMs = Math.min(Math.max(error.error.retryAfterMs ?? 60_000, 5_000), 5 * 60_000);
        return apiError("rate_limited", "OpenDota is busy right now. Try again shortly.", {
          reason: "upstream_rate_limited",
          retryAt: new Date(Date.now() + waitMs).toISOString(),
        });
      }
      return apiError("upstream_unavailable", "OpenDota is unavailable right now.", {
        reason: error.error.type,
      });
    }
  }
}
