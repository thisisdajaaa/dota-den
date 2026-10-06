import "server-only";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { Db } from "mongodb";
import { diffSummary, type Patch, type PatchDiffSummary } from "../domain/patch";
import { parsePatchVersion, patchVersionSortKey } from "../domain/patch-version";
import type { PatchWatchlist } from "../domain/watchlist";
import {
  PATCH_PAGE_DEFAULT,
  PATCH_PAGE_MAX,
  type PatchListItem,
  type PatchPage,
  type PatchQueriesPort,
  type PatchRefreshState,
  type PatchRefreshStatePort,
  type PatchesPort,
  type PatchWatchlistsPort,
  type StoredPatchState,
} from "../patches.ports";

const SCHEMA_VERSION = 1;

export const PATCH_COLLECTIONS = {
  patches: "patches",
  watchlists: "patch_watchlists",
  refreshState: "patch_refresh_state",
} as const;

export interface PatchDoc extends Patch {
  /** Numeric version order (see `patchVersionSortKey`); used for sorting and cursors. */
  sortKey: number;
  summary: PatchDiffSummary;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

interface WatchlistDoc {
  userId: string;
  heroIds: number[];
  itemIds: number[];
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

interface RefreshStateDoc {
  _id: string;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
}

const REFRESH_STATE_ID = "valve";

function sortKeyOf(version: string): number {
  const v = parsePatchVersion(version);
  if (!v.ok) throw new Error(`Refusing to store invalid patch version "${version}"`);
  return patchVersionSortKey(v.value);
}

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === 11000;
}

function toPatch(doc: PatchDoc): Patch {
  return {
    version: doc.version,
    name: doc.name,
    publishedAt: doc.publishedAt,
    sourceUrl: doc.sourceUrl,
    feedUrl: doc.feedUrl,
    language: doc.language,
    contentHash: doc.contentHash,
    parseStatus: doc.parseStatus,
    parseIssues: doc.parseIssues,
    parseRevision: doc.parseRevision,
    parserVersion: doc.parserVersion,
    referencesResolved: doc.referencesResolved,
    fetchedAt: doc.fetchedAt,
    sections: doc.sections,
  };
}

export class PatchesRepository implements PatchesPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  /** Patches, and the watchlists collection (one per user). */
  async ensureIndexes(): Promise<void> {
    const db = await this.getDb();
    const patches = db.collection(PATCH_COLLECTIONS.patches);
    await Promise.all([
      patches.createIndex({ version: 1 }, { unique: true, name: "uniq_version" }),
      patches.createIndex({ sourceUrl: 1 }, { unique: true, name: "uniq_sourceUrl" }),
      patches.createIndex({ publishedAt: -1 }, { name: "by_publishedAt" }),
      patches.createIndex({ sortKey: -1 }, { name: "by_sortKey" }),
      db
        .collection(PATCH_COLLECTIONS.watchlists)
        .createIndex({ userId: 1 }, { unique: true, name: "uniq_userId" }),
    ]);
  }

  private async col() {
    return (await this.getDb()).collection<PatchDoc>(PATCH_COLLECTIONS.patches);
  }

  private fields(patch: Patch) {
    return {
      ...patch,
      sortKey: sortKeyOf(patch.version),
      summary: diffSummary(patch),
      schemaVersion: SCHEMA_VERSION,
    };
  }

  async getState(version: string): Promise<StoredPatchState | null> {
    const doc = await (
      await this.col()
    ).findOne(
      { version },
      {
        projection: {
          _id: 0,
          version: 1,
          contentHash: 1,
          parseStatus: 1,
          parseRevision: 1,
          parserVersion: 1,
          referencesResolved: 1,
        },
      },
    );
    return doc
      ? {
          version: doc.version,
          contentHash: doc.contentHash,
          parseStatus: doc.parseStatus,
          parseRevision: doc.parseRevision,
          parserVersion: doc.parserVersion,
          referencesResolved: doc.referencesResolved,
        }
      : null;
  }

  async insert(patch: Patch): Promise<"inserted" | "conflict"> {
    const now = new Date();
    try {
      await (await this.col()).insertOne({ ...this.fields(patch), createdAt: now, updatedAt: now });
      return "inserted";
    } catch (e) {
      if (isDuplicateKey(e)) return "conflict";
      throw e;
    }
  }

  async replace(patch: Patch, expectedRevision: number): Promise<"updated" | "conflict"> {
    const res = await (
      await this.col()
    ).updateOne(
      { version: patch.version, parseRevision: expectedRevision },
      { $set: { ...this.fields(patch), updatedAt: new Date() } },
    );
    return res.matchedCount === 1 ? "updated" : "conflict";
  }

  async count(): Promise<number> {
    return (await this.col()).estimatedDocumentCount();
  }
}

const LIST_PROJECTION = {
  _id: 0,
  version: 1,
  name: 1,
  publishedAt: 1,
  sourceUrl: 1,
  parseStatus: 1,
  fetchedAt: 1,
  summary: 1,
} as const;

type ListDoc = Pick<PatchDoc, keyof typeof LIST_PROJECTION & keyof PatchDoc>;

function toListItem(doc: ListDoc): PatchListItem {
  return {
    version: doc.version,
    name: doc.name,
    publishedAt: doc.publishedAt,
    sourceUrl: doc.sourceUrl,
    parseStatus: doc.parseStatus,
    fetchedAt: doc.fetchedAt,
    summary: doc.summary,
  };
}

export class PatchReadRepository implements PatchQueriesPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<PatchDoc>(PATCH_COLLECTIONS.patches);
  }

  async list(opts: { cursor?: string | null; limit?: number } = {}): Promise<PatchPage> {
    const limit = Math.min(
      Math.max(1, Math.trunc(opts.limit ?? PATCH_PAGE_DEFAULT)),
      PATCH_PAGE_MAX,
    );
    const filter: Record<string, unknown> = {};
    if (opts.cursor) {
      const v = parsePatchVersion(opts.cursor);
      // An unparsable cursor can't point anywhere: return an empty page, not everything.
      if (!v.ok) return { items: [], nextCursor: null };
      filter.sortKey = { $lt: patchVersionSortKey(v.value) };
    }
    const docs = await (
      await this.col()
    )
      .find<ListDoc>(filter, {
        sort: { sortKey: -1 },
        limit: limit + 1,
        projection: LIST_PROJECTION,
      })
      .toArray();
    const page = docs.slice(0, limit).map(toListItem);
    return {
      items: page,
      nextCursor: docs.length > limit ? page[page.length - 1].version : null,
    };
  }

  async getByVersion(version: string): Promise<Patch | null> {
    const v = parsePatchVersion(version);
    if (!v.ok) return null;
    const doc = await (await this.col()).findOne({ version: v.value.value });
    return doc ? toPatch(doc) : null;
  }

  async latest(): Promise<PatchListItem | null> {
    const doc = await (
      await this.col()
    ).findOne<ListDoc>({}, { sort: { sortKey: -1 }, projection: LIST_PROJECTION });
    return doc ? toListItem(doc) : null;
  }
}

export class PatchWatchlistsRepository implements PatchWatchlistsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<WatchlistDoc>(PATCH_COLLECTIONS.watchlists);
  }

  async get(userId: string): Promise<PatchWatchlist | null> {
    const doc = await (await this.col()).findOne({ userId });
    return doc
      ? { userId: doc.userId, heroIds: doc.heroIds, itemIds: doc.itemIds, updatedAt: doc.updatedAt }
      : null;
  }

  async save(
    userId: string,
    ids: { heroIds: number[]; itemIds: number[] },
    now: Date,
  ): Promise<PatchWatchlist> {
    await (
      await this.col()
    ).updateOne(
      { userId },
      {
        $set: {
          heroIds: ids.heroIds,
          itemIds: ids.itemIds,
          schemaVersion: SCHEMA_VERSION,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    return { userId, heroIds: ids.heroIds, itemIds: ids.itemIds, updatedAt: now };
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}

export class PatchRefreshStateRepository implements PatchRefreshStatePort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<RefreshStateDoc>(PATCH_COLLECTIONS.refreshState);
  }

  async get(): Promise<PatchRefreshState | null> {
    const doc = await (await this.col()).findOne({ _id: REFRESH_STATE_ID });
    return doc ? { lastAttemptAt: doc.lastAttemptAt, lastSuccessAt: doc.lastSuccessAt } : null;
  }

  async tryClaim(now: Date, minIntervalMs: number): Promise<boolean> {
    try {
      const doc = await (
        await this.col()
      ).findOneAndUpdate(
        {
          _id: REFRESH_STATE_ID,
          $or: [
            { lastAttemptAt: null },
            { lastAttemptAt: { $lte: new Date(now.getTime() - minIntervalMs) } },
          ],
        },
        { $set: { lastAttemptAt: now }, $setOnInsert: { lastSuccessAt: null } },
        { upsert: true, returnDocument: "after" },
      );
      return doc !== null;
    } catch (e) {
      // The document exists but was attempted too recently.
      if (isDuplicateKey(e)) return false;
      throw e;
    }
  }

  async recordSuccess(now: Date): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: REFRESH_STATE_ID },
      { $set: { lastSuccessAt: now }, $setOnInsert: { lastAttemptAt: now } },
      { upsert: true },
    );
  }
}
