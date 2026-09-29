import { randomUUID } from "node:crypto";
import { MongoClient, type Db } from "mongodb";

/** A throwaway database per test file. Requires a reachable MongoDB (see ADR 0002). */
export async function createTestDb(): Promise<{ db: Db; teardown: () => Promise<void> }> {
  const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 3_000 }).connect();
  const db = client.db(`dd_test_${randomUUID().slice(0, 8)}`);
  return {
    db,
    teardown: async () => {
      await db.dropDatabase();
      await client.close();
    },
  };
}
