import { UpstreamUnavailableError } from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import { bucketedKey } from "../domain/job";
import type {
  CacheWarmPort,
  CronMonitorPort,
  CronRunsRepositoryPort,
  DiscordFeedPort,
  EmailDigestPort,
  JobQueue,
  MatchExtrasPort,
  MatchSyncPort,
  MedalPort,
  NotificationsPort,
  PatchImportPort,
} from "../jobs.ports";
import type { MatchSyncRunDto, PatchRefreshDto } from "../dtos/responses/cron-run.dto";

/** Total time for one match sync run; Vercel stops the function at 60s. */
// 46 s, not 50: the owner-alert checks after the run get up to MONITOR_MAX_MS more, and the
// whole function must finish inside Vercel's 60 s.
const RUN_BUDGET_MS = 46_000;
/** Syncing stops starting new accounts (and older-history pages) after this. */
const SYNC_BUDGET_MS = 38_000;
const DAY_MS = 24 * 3_600_000;
/** Notifications only start with at least this much of the run budget left. */
const NOTIFY_MIN_MS = 4_000;
/** Discord posts get at most this long, and only start with this much left for them. */
const DISCORD_MAX_MS = 15_000;
const DISCORD_MIN_MS = 2_000;
/** Match details for the extras get at most this long, and only start with this much left. */
const EXTRAS_MAX_MS = 8_000;
const EXTRAS_MIN_MS = 2_000;
/** The owner-alert checks after a run get at most this long (the function stops at 60s). */
const MONITOR_MAX_MS = 8_000;
/** A medal lookup (one OpenDota profile call, retries included) only starts with this much left. */
const MEDAL_MIN_MS = 3_000;
/** Total time for one patch refresh run, leaving the owner-alert checks MONITOR_MAX_MS. */
const PATCH_RUN_BUDGET_MS = 46_000;
/** The Meta page's tournament queries (lane duos take ~13s) only start with this much left. */
const META_MIN_MS = 15_000;

const TIMED_OUT = Symbol("timed_out");

/**
 * Waits for `task` at most `ms`. The task isn't cancelled (it may still finish, e.g. fill a
 * cache, while the function lives), but the run moves on and is recorded before Vercel stops it.
 */
async function within<T>(task: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), Math.max(0, ms));
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

type Trigger = "cron" | "admin";

/** The daily scheduled jobs (Vercel Cron), each recorded in cron_runs for the admin page. */
export class CronService {
  constructor(
    private readonly deps: {
      runs: CronRunsRepositoryPort;
      matches: MatchSyncPort;
      medals: MedalPort;
      /** Optional: a few match details per player for the hero coaching extras. */
      extras?: MatchExtrasPort;
      /** Optional: posts new matches to players' Discord feeds once the syncs are done. */
      discord?: DiscordFeedPort;
      /** Optional: sends the morning notifications once the syncs are done. */
      notifications?: NotificationsPort;
      /** Optional: sends the weekly email digest after the notifications. */
      weeklyEmail?: EmailDigestPort;
      patches: PatchImportPort;
      caches: CacheWarmPort;
      /** Optional: checks each finished run and alerts the owner (failures, stale jobs). */
      monitor?: CronMonitorPort;
      queue: () => JobQueue;
      logger: Pick<Logger, "info" | "warn">;
    },
  ) {}

  /** Records a run: started now, finished with `done`, then checked for alerts. Never throws. */
  private async track(name: string, trigger: Trigger) {
    const id = await this.deps.runs.start(name, trigger).catch(() => null);
    return async (result: { ok: boolean; summary: Record<string, unknown> }) => {
      if (id) await this.deps.runs.finish(id, result).catch(() => {});
      await this.monitor(name, result);
    };
  }

  private async monitor(name: string, result: { ok: boolean; summary: Record<string, unknown> }) {
    const monitor = this.deps.monitor;
    if (!monitor) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        this.deps.logger.warn("cron_monitor_timeout", { name });
        resolve();
      }, MONITOR_MAX_MS);
    });
    await Promise.race([
      monitor.cronFinished(name, result).catch((error: unknown) => {
        this.deps.logger.warn("cron_monitor_failed", { name, error });
      }),
      timeout,
    ]);
    clearTimeout(timer);
  }

  /**
   * Every player's matches (unfinished histories first), then their medal, then new matches
   * to Discord feeds, then the morning notifications and the weekly emails with whatever
   * time is left.
   */
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
        // A lookup started near the end could overrun, so each one is also capped at what's left.
        const left = RUN_BUDGET_MS - (Date.now() - started);
        if (left < MEDAL_MIN_MS) break;
        if (outcome === "skipped_time") continue;
        const recorded = await within(this.recordMedal(accountId32), left);
        if (recorded === TIMED_OUT) break;
        if (recorded) medals++;
      }
      // A few match details per player (capped per day), leaving the posts and notifications
      // their minimum.
      const forExtras = Math.min(
        EXTRAS_MAX_MS,
        RUN_BUDGET_MS - (Date.now() - started) - DISCORD_MIN_MS - NOTIFY_MIN_MS,
      );
      const extras =
        this.deps.extras && forExtras >= EXTRAS_MIN_MS
          ? await this.deps.extras
              .backfillMany(
                results.filter((r) => r.outcome !== "skipped_time").map((r) => r.accountId32),
                { budgetMs: forExtras },
              )
              .catch((error: unknown) => {
                this.deps.logger.warn("match_extras_run_failed", { error });
                return null;
              })
          : null;
      // Discord first (time-sensitive), leaving the notifications their minimum.
      const forDiscord = Math.min(
        DISCORD_MAX_MS,
        RUN_BUDGET_MS - (Date.now() - started) - NOTIFY_MIN_MS,
      );
      const discord =
        this.deps.discord && forDiscord >= DISCORD_MIN_MS
          ? await this.deps.discord.runAll({ budgetMs: forDiscord }).catch((error: unknown) => {
              this.deps.logger.warn("discord_run_failed", { error });
              return null;
            })
          : null;
      // Leave the weekly emails their minimum too.
      const left =
        RUN_BUDGET_MS - (Date.now() - started) - (this.deps.weeklyEmail ? NOTIFY_MIN_MS : 0);
      const notifications =
        this.deps.notifications && left >= NOTIFY_MIN_MS
          ? await this.deps.notifications.runDaily({ budgetMs: left }).catch((error: unknown) => {
              this.deps.logger.warn("notifications_run_failed", { error });
              return null;
            })
          : null;
      const leftForEmail = RUN_BUDGET_MS - (Date.now() - started);
      const digests =
        this.deps.weeklyEmail && leftForEmail >= NOTIFY_MIN_MS
          ? await this.deps.weeklyEmail
              .runDaily({ budgetMs: leftForEmail })
              .catch((error: unknown) => {
                this.deps.logger.warn("email_digest_run_failed", { error });
                return null;
              })
          : null;
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
        extras,
        discord,
        notifications,
        digests,
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

  private async recordMedal(accountId32: number): Promise<boolean> {
    const profile = await this.deps.medals.currentRankTier(accountId32);
    if (!profile) return false;
    await this.deps.medals.record(accountId32, profile.rankTier);
    return true;
  }

  /**
   * The latest patches, plus the slow tournament data the draft AI and Meta page cache. With
   * QStash both caches are refreshed by retried background jobs; otherwise they run here with
   * whatever time the run has left.
   */
  async runPatchRefresh(trigger: Trigger, requestId: string): Promise<PatchRefreshDto> {
    const done = await this.track("patches", trigger);
    const started = Date.now();
    const left = () => PATCH_RUN_BUDGET_MS - (Date.now() - started);
    const queue = this.deps.queue();
    const enqueue = (name: "draft-meta-warm" | "meta-warm") =>
      queue
        .enqueue(name, {}, { dedupKey: bucketedKey(name, DAY_MS, Date.now()) })
        .catch(() => "enqueue_failed" as const);
    const warm = async (
      key: string,
      task: () => Promise<Array<{ key: string; ok: boolean }>>,
      ms: number,
    ) => {
      const res = await within(
        task().catch(() => [{ key, ok: false }]),
        ms,
      );
      return res === TIMED_OUT ? ("timed_out" as const) : res;
    };

    let result: Awaited<ReturnType<PatchImportPort["importLatest"]>> | typeof TIMED_OUT;
    let tournaments: unknown;
    let meta: unknown;
    try {
      [result, tournaments] = await Promise.all([
        within(this.deps.patches.importLatest(), left()),
        // Inline, the draft AI's queries stop being waited for in time for the Meta queries.
        queue.durable
          ? enqueue("draft-meta-warm")
          : warm("tournaments", this.deps.caches.warmDraftData, left() - META_MIN_MS),
      ]);
      // The Meta page's slow tournament queries: cache them for every server.
      meta = queue.durable
        ? await enqueue("meta-warm")
        : left() >= META_MIN_MS
          ? await warm("meta", this.deps.caches.warmMeta, left())
          : "skipped_time";
    } catch (error) {
      await done({
        ok: false,
        summary: { error: error instanceof Error ? error.message : "unknown" },
      });
      throw error;
    }
    this.deps.logger.info("draft_meta_refresh", { requestId, tournaments, meta });
    const log = { requestId, trigger, durationMs: Date.now() - started };

    if (result === TIMED_OUT || !result.ok) {
      const reason = result === TIMED_OUT ? "timed_out" : result.error.error.type;
      await done({ ok: false, summary: { error: reason, tournaments, meta } });
      this.deps.logger.warn("patch_refresh_failed", { ...log, reason });
      throw new UpstreamUnavailableError("The official patch feed is unavailable right now.");
    }
    const failed = result.value.filter((o) => o.outcome === "failed");
    // Parser failures alert the owner (spec §10) through the monitor; also logged with reasons.
    if (failed.length > 0) this.deps.logger.warn("patch_import_degraded", { ...log, failed });
    await done({
      ok: failed.length === 0,
      summary: { imported: result.value.length, failed: failed.length, tournaments, meta },
    });
    this.deps.logger.info("patch_refresh_completed", { ...log, outcomes: result.value });
    return { outcomes: result.value };
  }
}
