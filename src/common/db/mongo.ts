import "server-only";
import { MongoClient, type Db } from "mongodb";
import { env } from "@/common/config/env";

type MongoCache = { client?: MongoClient; connecting?: Promise<MongoClient> };

// Cache on globalThis so warm serverless instances and dev HMR reuse one pool.
const globalForMongo = globalThis as typeof globalThis & { __ddMongo?: MongoCache };
const cache: MongoCache = (globalForMongo.__ddMongo ??= {});

export async function getMongoClient(): Promise<MongoClient> {
  if (cache.client) return cache.client;
  const { MONGODB_URI, MONGODB_MAX_POOL_SIZE } = env();
  cache.connecting ??= new MongoClient(MONGODB_URI, {
    maxPoolSize: MONGODB_MAX_POOL_SIZE,
    serverSelectionTimeoutMS: 5_000,
    appName: "dota-den",
  })
    .connect()
    .then((client) => {
      cache.client = client;
      return client;
    })
    .catch((err: unknown) => {
      cache.connecting = undefined;
      throw err;
    });
  return cache.connecting;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(env().MONGODB_DB_NAME);
}
