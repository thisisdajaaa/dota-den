import "server-only";
import { logger } from "@/common/logging/logger";
import { trackCronRun } from "@/modules/jobs/composition";
import { getMatchSyncService, getPlayerProfile } from "@/modules/matches/composition";
import { recordMedal } from "@/modules/mmr/composition";

/** Total time for one run; Vercel stops the function at 60s. */
const RUN_BUDGET_MS = 50_000;
/** Syncing stops starting new accounts (and older-history pages) after this. */
const SYNC_BUDGET_MS = 38_000;

export interface MatchSyncRun {
  accounts: number;
  synced: number;
  backfilling: number;
  failed: Array<{ accountId32: number; outcome: string }>;
  skipped: number;
  medals: number;
  durationMs: number;
}

/**
 * The daily background sync: every player's matches (unfinished histories first), then
 * their medal. Recorded in cron_runs (start first, so a run cut off still shows up).
 */
export async function runMatchSync(trigger: "cron" | "admin"): Promise<MatchSyncRun> {
  const started = Date.now();
  const done = await trackCronRun("matches", trigger);
  try {
    const results = await (
      await getMatchSyncService()
    ).syncDue({ limit: 200, budgetMs: SYNC_BUDGET_MS, maxPages: 20 });
    let medals = 0;
    for (const { accountId32, outcome } of results) {
      if (Date.now() - started > RUN_BUDGET_MS) break;
      if (outcome === "skipped_time") continue;
      const profile = await getPlayerProfile(accountId32);
      if (profile) {
        await recordMedal(accountId32, profile.rankTier);
        medals++;
      }
    }
    const run: MatchSyncRun = {
      accounts: results.length,
      synced: results.filter((r) => r.outcome === "synced").length,
      backfilling: results.filter((r) => r.outcome === "backfilling").length,
      failed: results
        .filter((r) => !["synced", "backfilling", "skipped_time", "cooldown"].includes(r.outcome))
        .map(({ accountId32, outcome }) => ({ accountId32, outcome })),
      skipped: results.filter((r) => r.outcome === "skipped_time" || r.outcome === "cooldown")
        .length,
      medals,
      durationMs: Date.now() - started,
    };
    await done({ ok: true, summary: { ...run } });
    logger.info("match_cron_completed", { trigger, ...run });
    return run;
  } catch (error) {
    await done({
      ok: false,
      summary: { error: error instanceof Error ? error.message : "unknown" },
    });
    throw error;
  }
}
