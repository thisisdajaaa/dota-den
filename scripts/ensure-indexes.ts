/**
 * Apply all collection indexes. Idempotent.
 * Usage: npm run db:indexes  (reads MONGODB_URI / MONGODB_DB_NAME from the environment)
 */
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { ensureDraftMetaCacheIndexes } from "@/modules/drafts/infrastructure/mongo-draft-meta-cache";
import { ensureDraftRoomIndexes } from "@/modules/drafts/infrastructure/mongo-draft-rooms";
import { ensureIdentityIndexes } from "@/modules/identity/infrastructure/mongo-identity-repositories";
import { ensureMatchIndexes } from "@/modules/matches/infrastructure/mongo-match-repositories";
import { ensureMmrIndexes } from "@/modules/mmr/infrastructure/mongo-mmr-repository";
import { ensurePatchIndexes } from "@/modules/patches/infrastructure/mongo-patch-repositories";
import { ensurePlayerIndexes } from "@/modules/players/infrastructure/mongo-follow-repository";

async function main(): Promise<void> {
  const db = await getDb();
  await ensureDraftMetaCacheIndexes(db);
  await ensureIdentityIndexes(db);
  await ensureDraftRoomIndexes(db);
  await ensureMatchIndexes(db);
  await ensureMmrIndexes(db);
  await ensurePatchIndexes(db);
  await ensurePlayerIndexes(db);
  console.log(`Indexes ensured on ${db.databaseName}`);
  await (await getMongoClient()).close();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
