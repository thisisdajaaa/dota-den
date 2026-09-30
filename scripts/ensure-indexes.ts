/**
 * Apply all collection indexes. Idempotent.
 * Usage: npm run db:indexes  (reads MONGODB_URI / MONGODB_DB_NAME from the environment)
 */
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { ensureDraftHistoryIndexes } from "@/modules/drafts/infrastructure/mongo-draft-history";
import { ensureDraftMetaCacheIndexes } from "@/modules/drafts/infrastructure/mongo-draft-meta-cache";
import { ensureDraftRoomIndexes } from "@/modules/drafts/infrastructure/mongo-draft-rooms";
import { ensureJobIndexes } from "@/modules/jobs/infrastructure/mongo-job-runs";
import { ensureIdentityIndexes } from "@/modules/identity/infrastructure/mongo-identity-repositories";
import { ensureLeaderboardIndexes } from "@/modules/leaderboards/infrastructure/mongo-activity-repository";
import { ensureMatchIndexes } from "@/modules/matches/infrastructure/mongo-match-repositories";
import { ensureMmrIndexes } from "@/modules/mmr/infrastructure/mongo-mmr-repository";
import { ensurePatchIndexes } from "@/modules/patches/infrastructure/mongo-patch-repositories";
import { ensurePlayerIndexes } from "@/modules/players/infrastructure/mongo-follow-repository";
import { ensureSessionIndexes } from "@/modules/sessions/infrastructure/mongo-session-repositories";
import { ensureTogetherIndexes } from "@/modules/together/infrastructure/mongo-together-repository";

async function main(): Promise<void> {
  const db = await getDb();
  await ensureDraftMetaCacheIndexes(db);
  await ensureIdentityIndexes(db);
  await ensureJobIndexes(db);
  await ensureDraftRoomIndexes(db);
  await ensureDraftHistoryIndexes(db);
  await ensureLeaderboardIndexes(db);
  await ensureMatchIndexes(db);
  await ensureMmrIndexes(db);
  await ensurePatchIndexes(db);
  await ensurePlayerIndexes(db);
  await ensureSessionIndexes(db);
  await ensureTogetherIndexes(db);
  console.log(`Indexes ensured on ${db.databaseName}`);
  await (await getMongoClient()).close();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
