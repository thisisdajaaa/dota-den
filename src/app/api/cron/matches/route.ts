import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { apiError, requestId } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getMatchSyncService } from "@/modules/matches/composition";

export const maxDuration = 60;

/**
 * Daily match sync for every player, called by Vercel Cron (see vercel.json). Finishes long
 * history imports and picks up new games without the player visiting (on-visit syncs only
 * cover a few pages, and background continuation otherwise needs QStash).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = env().CRON_SECRET;
  if (!secret) return apiError("upstream_unavailable", "Cron is not configured");
  if (!isCronAuthorized(req, secret)) return apiError("unauthorized", "Invalid cron credentials");

  const started = Date.now();
  const results = await (
    await getMatchSyncService()
  ).syncDue({ limit: 200, budgetMs: 45_000, maxPages: 20 });
  logger.info("match_cron_completed", {
    requestId: requestId(req),
    durationMs: Date.now() - started,
    results,
  });
  return NextResponse.json({ results });
}
