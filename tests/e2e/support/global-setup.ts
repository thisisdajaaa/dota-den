import { MongoClient } from "mongodb";

/** Start every E2E run from an empty database so sync cooldowns and sessions don't leak. */
export default async function globalSetup(): Promise<void> {
  const client = await new MongoClient(
    process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017",
  ).connect();
  await client.db(process.env.E2E_DB_NAME ?? "dota_den_e2e").dropDatabase();
  await client.close();
}
