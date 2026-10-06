import type { Db } from "mongodb";

/** A cached upstream payload: fresh for a while, then served stale while it refreshes. */
export interface CachedJson {
  body: unknown;
  fetchedAt: Date;
}

export interface DraftMetaCache {
  get(key: string): Promise<CachedJson | null>;
  put(key: string, body: unknown, now: Date): Promise<void>;
}

interface CacheDoc {
  _id: string;
  body: unknown;
  fetchedAt: Date;
  /** TTL: stale data older than this is useless even as a fallback. */
  expiresAt: Date;
}

const KEEP_MS = 7 * 24 * 3_600_000;
const COLLECTION = "draft_meta_cache";

/**
 * Tournament queries take seconds upstream, and serverless instances forget in-memory
 * caches, so results are kept in MongoDB and shared by every instance.
 */
export class DraftMetaCacheRepository implements DraftMetaCache {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async docs() {
    return (await this.getDb()).collection<CacheDoc>(COLLECTION);
  }

  async get(key: string): Promise<CachedJson | null> {
    const doc = await (await this.docs()).findOne({ _id: key });
    return doc ? { body: doc.body, fetchedAt: doc.fetchedAt } : null;
  }

  async put(key: string, body: unknown, now: Date): Promise<void> {
    await (
      await this.docs()
    ).replaceOne(
      { _id: key },
      { body, fetchedAt: now, expiresAt: new Date(now.getTime() + KEEP_MS) },
      { upsert: true },
    );
  }

  async ensureIndexes(): Promise<void> {
    const db = await this.getDb();
    await db
      .collection<CacheDoc>(COLLECTION)
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" });
  }
}
