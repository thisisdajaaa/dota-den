/**
 * Apply all collection indexes. Idempotent.
 * Usage: npm run db:indexes  (reads MONGODB_URI / MONGODB_DB_NAME from the environment)
 */
import { getDb, getMongoClient } from "@/common/db/mongo";
import { AlertLogRepository } from "@/modules/alerts/repositories/alert-log.repository";
import { AlertThrottleRepository } from "@/modules/alerts/repositories/alert-throttle.repository";
import { OpsReportsRepository } from "@/modules/alerts/repositories/ops-reports.repository";
import { AnnotationsRepository } from "@/modules/annotations/annotations.repository";
import { GoalsRepository } from "@/modules/goals/goals.repository";
import { PracticeRepository } from "@/modules/practice/practice.repository";
import { GroupsRepository } from "@/modules/groups/repositories/groups.repository";
import { SharesRepository } from "@/modules/shares/repositories/shares.repository";
import { EmailLogRepository } from "@/modules/email/repositories/email-log.repository";
import { EmailSubscriptionsRepository } from "@/modules/email/repositories/email-subscriptions.repository";
import { EmailWebhookEventsRepository } from "@/modules/email/repositories/email-webhook-events.repository";
import { NotificationLogRepository } from "@/modules/notifications/repositories/notification-log.repository";
import { PushSubscriptionsRepository } from "@/modules/notifications/repositories/push-subscriptions.repository";
import { DiscordPostLogRepository } from "@/modules/discord/repositories/discord-post-log.repository";
import { DiscordWebhooksRepository } from "@/modules/discord/repositories/discord-webhooks.repository";
import { ErrorsRepository } from "@/modules/errors/errors.repository";
import { CronRunsRepository } from "@/modules/jobs/repositories/cron-runs.repository";
import { JobRunsRepository } from "@/modules/jobs/repositories/job-runs.repository";
import { NoncesRepository } from "@/modules/identity/repositories/nonces.repository";
import { AuthSessionsRepository } from "@/modules/identity/repositories/auth-sessions.repository";
import { UsersRepository } from "@/modules/identity/repositories/users.repository";
import { VisitDaysRepository } from "@/modules/identity/repositories/visit-days.repository";
import { StreamerFollowsRepository } from "@/modules/live/repositories/streamer-follows.repository";
import { SubscriptionsRepository } from "@/modules/plus/repositories/subscriptions.repository";
import { WebhookEventsRepository } from "@/modules/plus/repositories/webhook-events.repository";
import { ActivityRepository } from "@/modules/leaderboards/repositories/activity.repository";
import { DraftHistoryRepository } from "@/modules/drafts/repositories/draft-history.repository";
import { DraftMetaCacheRepository } from "@/modules/drafts/repositories/draft-meta-cache.repository";
import { DraftRoomsRepository } from "@/modules/drafts/repositories/draft-rooms.repository";
import { MatchDraftReadsRepository } from "@/modules/drafts/repositories/match-draft-reads.repository";
import { ReplayReadsRepository } from "@/modules/report/repositories/replay-reads.repository";
import { MatchFactsRepository } from "@/modules/matches/repositories/matches.repository";
import { MatchExtrasRepository } from "@/modules/matches/repositories/match-extras.repository";
import {
  CoachReviewsRepository,
  CoachUsageRepository,
  AutoReviewsRepository,
  ParseRequestsRepository,
} from "@/modules/matches/repositories/match-coach.repository";
import { MedalHistoryRepository } from "@/modules/mmr/repositories/medal-history.repository";
import { MmrEntriesRepository } from "@/modules/mmr/repositories/mmr-entries.repository";
import { PatchesRepository } from "@/modules/patches/repositories/patches.repository";
import { FollowsRepository } from "@/modules/players/repositories/follows.repository";
import { PlayerProfilesRepository } from "@/modules/players/repositories/player-profiles.repository";
import {
  SessionNotesRepository,
  SessionSettingsRepository,
} from "@/modules/sessions/repositories/sessions.repository";
import { TogetherMatchesRepository } from "@/modules/together/repositories/together.repository";

async function main(): Promise<void> {
  const db = await getDb();
  await new DraftMetaCacheRepository(async () => db).ensureIndexes();
  await new AnnotationsRepository(async () => db).ensureIndexes();
  await new GoalsRepository(async () => db).ensureIndexes();
  await new PracticeRepository(async () => db).ensureIndexes();
  await new GroupsRepository(async () => db).ensureIndexes();
  await new SharesRepository(async () => db).ensureIndexes();
  await new PushSubscriptionsRepository(async () => db).ensureIndexes();
  await new NotificationLogRepository(async () => db).ensureIndexes();
  await new DiscordWebhooksRepository(async () => db).ensureIndexes();
  await new DiscordPostLogRepository(async () => db).ensureIndexes();
  await new EmailSubscriptionsRepository(async () => db).ensureIndexes();
  await new EmailLogRepository(async () => db).ensureIndexes();
  await new EmailWebhookEventsRepository(async () => db).ensureIndexes();
  await Promise.all([
    new UsersRepository(async () => db).ensureIndexes(),
    new AuthSessionsRepository(async () => db).ensureIndexes(),
    new VisitDaysRepository(async () => db).ensureIndexes(),
    new NoncesRepository(async () => db).ensureIndexes(),
  ]);
  await new ErrorsRepository(async () => db).ensureIndexes();
  await new JobRunsRepository(async () => db).ensureIndexes();
  await new CronRunsRepository(async () => db).ensureIndexes();
  await new AlertLogRepository(async () => db).ensureIndexes();
  await new AlertThrottleRepository(async () => db).ensureIndexes();
  await new OpsReportsRepository(async () => db).ensureIndexes();
  await new DraftRoomsRepository(async () => db).ensureIndexes();
  await new MatchDraftReadsRepository(async () => db).ensureIndexes();
  await new DraftHistoryRepository(async () => db).ensureIndexes();
  await new ActivityRepository(async () => db).ensureIndexes();
  await new MatchFactsRepository(async () => db).ensureIndexes();
  await new MatchExtrasRepository(async () => db).ensureIndexes();
  await Promise.all([
    new CoachReviewsRepository(async () => db).ensureIndexes(),
    new CoachUsageRepository(async () => db).ensureIndexes(),
    new ParseRequestsRepository(async () => db).ensureIndexes(),
    new AutoReviewsRepository(async () => db).ensureIndexes(),
  ]);
  await new ReplayReadsRepository(async () => db).ensureIndexes();
  await new MmrEntriesRepository(async () => db).ensureIndexes();
  await new MedalHistoryRepository(async () => db).ensureIndexes();
  await new PatchesRepository(async () => db).ensureIndexes();
  await new FollowsRepository(async () => db).ensureIndexes();
  await new PlayerProfilesRepository(async () => db).ensureIndexes();
  await new StreamerFollowsRepository(async () => db).ensureIndexes();
  await new SubscriptionsRepository(async () => db).ensureIndexes();
  await new WebhookEventsRepository(async () => db).ensureIndexes();
  await Promise.all([
    new SessionNotesRepository(async () => db).ensureIndexes(),
    new SessionSettingsRepository(async () => db).ensureIndexes(),
  ]);
  await new TogetherMatchesRepository(async () => db).ensureIndexes();
  console.log(`Indexes ensured on ${db.databaseName}`);
  await (await getMongoClient()).close();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
