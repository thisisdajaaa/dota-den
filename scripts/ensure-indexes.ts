/**
 * Apply all collection indexes. Idempotent.
 * Usage: npm run db:indexes  (reads MONGODB_URI / MONGODB_DB_NAME from the environment)
 */
import { getDb, getMongoClient } from "@/common/db/mongo";
import { AnnotationsRepository } from "@/modules/annotations/annotations.repository";
import { GoalsRepository } from "@/modules/goals/goals.repository";
import { ensureDraftHistoryIndexes } from "@/modules/drafts/infrastructure/mongo-draft-history";
import { ensureDraftMetaCacheIndexes } from "@/modules/drafts/infrastructure/mongo-draft-meta-cache";
import { ensureMatchDraftReadIndexes } from "@/modules/drafts/infrastructure/match-draft-reads";
import { ensureDraftRoomIndexes } from "@/modules/drafts/infrastructure/mongo-draft-rooms";
import { ErrorsRepository } from "@/modules/errors/errors.repository";
import { CronRunsRepository } from "@/modules/jobs/repositories/cron-runs.repository";
import { JobRunsRepository } from "@/modules/jobs/repositories/job-runs.repository";
import { NoncesRepository } from "@/modules/identity/repositories/nonces.repository";
import { AuthSessionsRepository } from "@/modules/identity/repositories/auth-sessions.repository";
import { UsersRepository } from "@/modules/identity/repositories/users.repository";
import { ActivityRepository } from "@/modules/leaderboards/repositories/activity.repository";
import { ensureMatchIndexes } from "@/modules/matches/infrastructure/mongo-match-repositories";
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
  await ensureDraftMetaCacheIndexes(db);
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
  await ensureDraftRoomIndexes(db);
  await ensureMatchDraftReadIndexes(db);
  await ensureDraftHistoryIndexes(db);
  await new ActivityRepository(async () => db).ensureIndexes();
  await ensureMatchIndexes(db);
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
