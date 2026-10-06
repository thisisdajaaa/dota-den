import { UpstreamUnavailableError } from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import { bucketedKey } from "../domain/job";
import type {
  CacheWarmPort,
  CronRunsRepositoryPort,
  JobQueue,
  MatchSyncPort,
  MedalPort,
  PatchImportPort,
} from "../jobs.ports";
import type { MatchSyncRunDto, PatchRefreshDto } from "../dtos/responses/cron-run.dto";

/** Total time for one match sync run; Vercel stops the function at 60s. */
const RUN_BUDGET_MS = 50_000;
/** Syncing stops starting new accounts (and older-history pages) after this. */
const SYNC_BUDGET_MS = 38_000;
const DAY_MS = 24 * 3_600_000;

type Trigger = "cron" | "admin";

/** The daily scheduled jobs (Vercel Cron), each recorded in cron_runs for the admin page. */
export class CronService {
  constructor(
    private readonly deps: {
      runs: CronRunsRepositoryPort;
      matches: MatchSyncPort;
      medals: MedalPort;
      patches: PatchImportPort;
      caches: CacheWarmPort;
      queue: () => JobQueue;
      logger: Pick<Logger, "info" | "warn">;
    },
  ) {}

  /** Records a run: started now, finished with `done`. Never throws. */
  private async track(name: string, trigger: Trigger) {
    const id = await this.deps.runs.start(name, trigger).catch(() => null);
    return async (result: { ok: boolean; summary: Record<string, unknown> }) => {
      if (id) await this.deps.runs.finish(id, result).catch(() => {});
    };
  }

  /** Every player's matches (unfinished histories first), then their medal. */
  async runMatchSync(trigger: Trigger): Promise<MatchSyncRunDto> {
    const started = Date.now();
    const done = await this.track("matches", trigger);
    try {
      const results = await this.deps.matches.syncDue({
        limit: 200,
        budgetMs: SYNC_BUDGET_MS,
        maxPages: 20,
      });
      let medals = 0;
      for (const { accountId32, outcome } of results) {
        if (Date.now() - started > RUN_BUDGET_MS) break;
        if (outcome === "skipped_time") continue;
        const profile = await this.deps.medals.currentRankTier(accountId32);
        if (profile) {
          await this.deps.medals.record(accountId32, profile.rankTier);
          medals++;
        }
      }
      const run: MatchSyncRunDto = {
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
      this.deps.logger.info("match_cron_completed", { trigger, ...run });
      return run;
    } catch (error) {
      await done({
        ok: false,
        summary: { error: error instanceof Error ? error.message : "unknown" },
      });
      throw error;
    }
  }

  /** The latest patches, plus the slow tournament data the draft AI and Meta page cache. */
  async runPatchRefresh(trigger: Trigger, requestId: string): Promise<PatchRefreshDto> {
    const done = await this.track("patches", trigger);
    const started = Date.now();
    // The draft AI's tournament data: a retried background job with QStash, else right here.
    const queue = this.deps.queue();
    const [result, tournaments] = await Promise.all([
      this.deps.patches.importLatest(),
      queue.durable
        ? queue
            .enqueue(
              "draft-meta-warm",
              {},
              { dedupKey: bucketedKey("draft-meta-warm", DAY_MS, Date.now()) },
            )
            .catch(() => "enqueue_failed")
        : this.deps.caches.warmDraftData().catch(() => [{ key: "tournaments", ok: false }]),
    ]);
    // The Meta page's slow tournament queries (lane duos take ~13s): cache them for every server.
    const meta = await this.deps.caches.warmMeta();
    this.deps.logger.info("draft_meta_refresh", { requestId, tournaments, meta });
    const log = { requestId, trigger, durationMs: Date.now() - started };

    if (!result.ok) {
      const reason = result.error.error.type;
      await done({ ok: false, summary: { error: reason, meta } });
      this.deps.logger.warn("patch_refresh_failed", { ...log, reason });
      throw new UpstreamUnavailableError("The official patch feed is unavailable right now.");
    }
    const failed = result.value.filter((o) => o.outcome === "failed");
    // Parser failures should alert (spec §10): log at warn with the reasons.
    if (failed.length > 0) this.deps.logger.warn("patch_import_degraded", { ...log, failed });
    await done({
      ok: failed.length === 0,
      summary: { imported: result.value.length, failed: failed.length, meta },
    });
    this.deps.logger.info("patch_refresh_completed", { ...log, outcomes: result.value });
    return { outcomes: result.value };
  }
}
