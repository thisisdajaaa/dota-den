import "server-only";
import { Client, Receiver } from "@upstash/qstash";
import { afterResponse } from "@/common/http/after-response";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { opsMonitor } from "@/modules/alerts";
import { discordFeedService } from "@/modules/discord";
import { draftInsights } from "@/modules/drafts";
import { emailDigest } from "@/modules/email";
import { matchExtrasService, matchesService, matchSyncService } from "@/modules/matches";
import { autoReviewService } from "@/modules/matches";
import { sessionCompanionService } from "@/modules/sessions";
import { BACKFILL_COOLDOWN_MS } from "@/modules/matches/domain/sync-policy";
import { streamerAlerts as goLiveAlerts } from "@/modules/live";
import { metaService } from "@/modules/meta";
import { medalService } from "@/modules/mmr";
import { notificationTriggers } from "@/modules/notifications";
import { patchImportService } from "@/modules/patches";
import { InlineJobQueue } from "./infrastructure/inline-job-queue";
import { QStashJobQueue } from "./infrastructure/qstash-job-queue";
import { setUpSchedules } from "./infrastructure/qstash-schedules";
import type { ScheduleSet } from "./domain/schedules";
import { JobsController } from "./jobs.controller";
import type { JobQueue, MatchSyncPort } from "./jobs.ports";
import { CronRunsRepository } from "./repositories/cron-runs.repository";
import { JobRunsRepository } from "./repositories/job-runs.repository";
import { CronService } from "./services/cron.service";
import { JobRunner } from "./services/job-runner.service";
import { JobsService } from "./services/jobs.service";

export const jobRunsRepository = new JobRunsRepository(getDb);
export const cronRunsRepository = new CronRunsRepository(getDb);

const matches: MatchSyncPort = {
  sync: async (id) => matchSyncService.sync(id),
  syncDue: async (opts) => matchSyncService.syncDue(opts),
};

/** QStash when configured (durable, retried, can wait); otherwise in-process after the response. */
function jobQueue(): JobQueue {
  const { QSTASH_TOKEN, QSTASH_URL, APP_URL, VERCEL_AUTOMATION_BYPASS_SECRET: bypass } = env();
  if (QSTASH_TOKEN) {
    return new QStashJobQueue(new Client({ token: QSTASH_TOKEN, baseUrl: QSTASH_URL }), {
      appUrl: APP_URL,
      // Vercel deployment protection (staging) needs the automation bypass header.
      headers: bypass ? { "x-vercel-protection-bypass": bypass } : undefined,
    });
  }
  return new InlineJobQueue({
    run: async (name, payload, dedupKey) => {
      const outcome = await jobRunner.run(name, payload, dedupKey);
      if (outcome.status === "failed") logger.warn("job_failed", { name, error: outcome.error });
    },
    schedule: (task) => afterResponse("inline_job", task),
  });
}

/**
 * Sets up the recurring QStash schedules for this deployment (admin page). Null when QStash
 * isn't configured: jobs then run in-process and nothing is scheduled.
 */
export async function setUpJobSchedules(): Promise<ScheduleSet[] | null> {
  const { QSTASH_TOKEN, QSTASH_URL, APP_URL, VERCEL_AUTOMATION_BYPASS_SECRET: bypass } = env();
  if (!QSTASH_TOKEN) return null;
  return setUpSchedules(new Client({ token: QSTASH_TOKEN, baseUrl: QSTASH_URL }), {
    appUrl: APP_URL,
    bypass,
  });
}

const warmDraftData = () => draftInsights().warm();
const warmMeta = () => metaService.warmCaches();

export const jobsService = new JobsService({
  queue: jobQueue,
  matches,
  backfillCooldownMs: BACKFILL_COOLDOWN_MS,
  // Plus priority sync (ADR 0014): a shorter wait between a supporter's history chunks.
  cooldownFor: async (accountId32) =>
    (await matchSyncService.policyFor(accountId32)).backfillCooldownMs,
  warmDraftData,
  warmMeta,
  streamerAlerts: async () => {
    const run = await goLiveAlerts.run();
    return { ...run };
  },
  coachAutoReview: async (payload) => {
    await autoReviewService.run(payload);
  },
  sessionCompanion: () => sessionCompanionService.run(),
  logger,
});

export const jobRunner = new JobRunner({
  handlers: jobsService.handlers(),
  runs: jobRunsRepository,
});

export const cronService = new CronService({
  runs: cronRunsRepository,
  matches,
  medals: {
    currentRankTier: async (id) => {
      const profile = await matchesService.playerProfile(id);
      return profile ? { rankTier: profile.rankTier } : null;
    },
    record: (id, tier) => medalService.record(id, tier),
  },
  extras: { backfillMany: (ids, opts) => matchExtrasService.backfillMany(ids, opts) },
  discord: { runAll: (opts) => discordFeedService.runAll(opts) },
  notifications: { runDaily: (opts) => notificationTriggers.runDaily(opts) },
  weeklyEmail: { runDaily: (opts) => emailDigest.runDaily(opts) },
  patches: { importLatest: () => patchImportService.importLatest() },
  caches: { warmDraftData, warmMeta },
  monitor: {
    cronFinished: async (name, result) => {
      await opsMonitor.cronFinished(name, result);
    },
  },
  queue: jobQueue,
  logger,
});

/** Verifies QStash signatures; null when QStash isn't configured. */
function qstashReceiver(): Receiver | null {
  const { QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY } = env();
  if (!QSTASH_TOKEN || !QSTASH_CURRENT_SIGNING_KEY) return null;
  return new Receiver({
    currentSigningKey: QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: QSTASH_NEXT_SIGNING_KEY ?? QSTASH_CURRENT_SIGNING_KEY,
  });
}

export const jobsController = new JobsController({
  runner: () => jobRunner,
  streamerAlerts: () => jobsService.runStreamerAlerts(),
  cron: cronService,
  verifier: qstashReceiver,
  appUrl: () => env().APP_URL,
  logger,
});
