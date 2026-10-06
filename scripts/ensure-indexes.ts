/**
 * Apply all collection indexes. Idempotent.
 * Usage: npm run db:indexes  (reads MONGODB_URI / MONGODB_DB_NAME from the environment)
 */
import { getDb, getMongoClient } from "@/common/db/mongo";
import { AnnotationsRepository } from "@/modules/annotations/annotations.repository";
import { GoalsRepository } from "@/modules/goals/goals.repository";
import { ErrorsRepository } from "@/modules/errors/errors.repository";
import { CronRunsRepository } from "@/modules/jobs/repositories/cron-runs.repository";
import { JobRunsRepository } from "@/modules/jobs/repositories/job-runs.repository";
import { NoncesRepository } from "@/modules/identity/repositories/nonces.repository";
import { AuthSessionsRepository } from "@/modules/identity/repositories/auth-sessions.repository";
import { UsersRepository } from "@/modules/identity/repositories/users.repository";
import { ActivityRepository } from "@/modules/leaderboards/repositories/activity.repository";
import { DraftHistoryRepository } from "@/modules/drafts/repositories/draft-history.repository";
import { DraftMetaCacheRepository } from "@/modules/drafts/repositories/draft-meta-cache.repository";
import { DraftRoomsRepository } from "@/modules/drafts/repositories/draft-rooms.repository";
import { MatchDraftReadsRepository } from "@/modules/drafts/repositories/match-draft-reads.repository";
import { MatchFactsRepository } from "@/modules/matches/repositories/matches.repository";
import { MedalHistoryRepository } from "@/modules/mmr/repositories/medal-history.repository";
import { MmrEntriesRepository } from "@/modules/mmr/repositories/mmr-entries.repository";
import { PatchesRepository } from "@/modules/patches/repositories/patches.repository";
import { FollowsRepository } from "@/modules/players/repositories/follows.repository";
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
  await Promise.all([
    new UsersRepository(async () => db).ensureIndexes(),
    new AuthSessionsRepository(async () => db).ensureIndexes(),
    new NoncesRepository(async () => db).ensureIndexes(),
  ]);
  await new ErrorsRepository(async () => db).ensureIndexes();
  await new JobRunsRepository(async () => db).ensureIndexes();
  await new CronRunsRepository(async () => db).ensureIndexes();
  await new DraftRoomsRepository(async () => db).ensureIndexes();
  await new MatchDraftReadsRepository(async () => db).ensureIndexes();
  await new DraftHistoryRepository(async () => db).ensureIndexes();
  await new ActivityRepository(async () => db).ensureIndexes();
  await new MatchFactsRepository(async () => db).ensureIndexes();
  await new MmrEntriesRepository(async () => db).ensureIndexes();
  await new MedalHistoryRepository(async () => db).ensureIndexes();
  await new PatchesRepository(async () => db).ensureIndexes();
  await new FollowsRepository(async () => db).ensureIndexes();
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
