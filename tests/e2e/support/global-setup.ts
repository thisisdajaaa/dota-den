import { execFileSync } from "node:child_process";
import { MongoClient } from "mongodb";

/**
 * Start every E2E run from an empty database so sync cooldowns and sessions don't leak, with
 * the same indexes as production: without the unique ones, parallel first sign-ins of one
 * test identity can create the same user twice.
 */
export default async function globalSetup(): Promise<void> {
  const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
  const name = process.env.E2E_DB_NAME ?? "dota_den_e2e";
  const client = await new MongoClient(uri).connect();
  await client.db(name).dropDatabase();
  await client.close();
  execFileSync("npm", ["run", "--silent", "db:indexes"], {
    // The script validates the app's config, which needs an APP_URL (any URL does here).
    env: {
      ...process.env,
      MONGODB_URI: uri,
      MONGODB_DB_NAME: name,
      APP_URL: process.env.APP_URL ?? "http://localhost:3100",
    },
    stdio: "inherit",
  });
}
