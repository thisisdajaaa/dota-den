import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { apiError, requestId } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getMatchSyncService, getPlayerProfile } from "@/modules/matches/composition";
import { recordMedal } from "@/modules/mmr/composition";

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
  ).syncDue({ limit: 200, budgetMs: 40_000, maxPages: 20 });
  // Note each player's medal too, within what's left of the time budget.
  let medals = 0;
  for (const { accountId32 } of results) {
    if (Date.now() - started > 55_000) break;
    const profile = await getPlayerProfile(accountId32);
    if (profile) {
      await recordMedal(accountId32, profile.rankTier);
      medals++;
    }
  }
  logger.info("match_cron_completed", {
    medals,
    requestId: requestId(req),
    durationMs: Date.now() - started,
    results,
  });
  return NextResponse.json({ results });
}
