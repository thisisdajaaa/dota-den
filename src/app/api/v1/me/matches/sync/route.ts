import { NextResponse, type NextRequest } from "next/server";
import { apiError, isSameOrigin, requestId } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getAuthService, SESSION_COOKIE } from "@/modules/identity/composition";
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
    case "provider":
      return error.error.type === "rate_limited"
        ? apiError("rate_limited", "OpenDota is rate limiting requests. Try again shortly.")
        : apiError("upstream_unavailable", "OpenDota is unavailable right now.", {
            reason: error.error.type,
          });
  }
}
