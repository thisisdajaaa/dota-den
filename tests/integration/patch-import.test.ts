import type { Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PatchImportService } from "@/modules/patches/services/patch-import.service";
import { EMPTY_SECTIONS, type Patch } from "@/modules/patches/domain/patch";
import {
  PatchReadRepository,
  PatchRefreshStateRepository,
  PatchesRepository,
} from "@/modules/patches/repositories/patches.repository";
import { PATCH_COLLECTIONS } from "@/modules/patches/repositories/patches.repository";
import { patchDetail } from "../fixtures/valve-patches";
import { fakeReferences, scriptedValve } from "../support/patch-fakes";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await new PatchesRepository(async () => db).ensureIndexes();
});
afterAll(async () => teardown?.());
beforeEach(async () => {
  await db.collection(PATCH_COLLECTIONS.patches).deleteMany({});
  await db.collection(PATCH_COLLECTIONS.refreshState).deleteMany({});
});

function service() {
  const valve = scriptedValve();
  const svc = new PatchImportService({
    source: valve.adapter,
    references: fakeReferences(),
    patches: new PatchesRepository(async () => db),
    refreshState: new PatchRefreshStateRepository(async () => db),
  });
  return { svc, valve };
}

function patch(version: string, publishedAt: Date): Patch {
  return {
    version,
    name: version,
    publishedAt,
    sourceUrl: `https://www.dota2.com/patches/${version}`,
    feedUrl: `https://www.dota2.com/datafeed/patchnotes?version=${version}&language=english`,
    language: "english",
    contentHash: `hash-${version}`,
    parseStatus: "parsed",
    parseIssues: [],
    parseRevision: 1,
    parserVersion: 1,
    referencesResolved: true,
    fetchedAt: new Date(),
    sections: EMPTY_SECTIONS,
  };
}

describe("patch import against MongoDB", () => {
  it("does not duplicate a patch fetched twice, and revises changed content", async () => {
    const { svc, valve } = service();
    const col = db.collection(PATCH_COLLECTIONS.patches);

    expect(await svc.importVersion("7.41")).toMatchObject({
      outcome: "inserted",
      parseRevision: 1,
    });
    const firstDoc = await col.findOne({ version: "7.41" });
    expect(await svc.importVersion("7.41")).toMatchObject({
      outcome: "unchanged",
      parseRevision: 1,
    });
    expect(await col.countDocuments({ version: "7.41" })).toBe(1);
    // Unchanged means untouched: no write at all.
    expect((await col.findOne({ version: "7.41" }))?.updatedAt).toEqual(firstDoc?.updatedAt);

    valve.state.details.set("7.41", patchDetail("7.41", { neutral_creeps: [] }));
    expect(await svc.importVersion("7.41")).toMatchObject({ outcome: "updated", parseRevision: 2 });
    const doc = await col.findOne({ version: "7.41" });
    expect(await col.countDocuments({ version: "7.41" })).toBe(1);
    expect(doc).toMatchObject({
      parseRevision: 2,
      sortKey: 704_100,
      summary: expect.objectContaining({ neutralCreepsChanged: 0, heroesChanged: 2 }),
      createdAt: firstDoc?.createdAt,
    });
    expect(doc?.contentHash).not.toBe(firstDoc?.contentHash);
  });

  it("enforces one document per version", async () => {
    const repo = new PatchesRepository(async () => db);
    const p = patch("7.40", new Date("2025-12-15T00:00:00Z"));
    expect(await repo.insert(p)).toBe("inserted");
    expect(await repo.insert({ ...p, contentHash: "other" })).toBe("conflict");
    await expect(
      db.collection(PATCH_COLLECTIONS.patches).insertOne({ version: "7.40", sourceUrl: "x" }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("guards replacement with the expected revision", async () => {
    const repo = new PatchesRepository(async () => db);
    const p = patch("7.39", new Date("2025-06-01T00:00:00Z"));
    await repo.insert(p);
    expect(await repo.replace({ ...p, parseRevision: 2 }, 1)).toBe("updated");
    expect(await repo.replace({ ...p, parseRevision: 2 }, 1)).toBe("conflict");
    expect((await repo.getState("7.39"))?.parseRevision).toBe(2);
  });

  it("lists newest version first with cursor pagination", async () => {
    const repo = new PatchesRepository(async () => db);
    const versions = ["7.39", "7.40", "7.41", "7.41a", "7.41b", "7.08"];
    for (const [i, v] of versions.entries())
      await repo.insert(patch(v, new Date(Date.UTC(2025, 0, 1 + i))));
    const queries = new PatchReadRepository(async () => db);

    const page1 = await queries.list({ limit: 4 });
    expect(page1.items.map((p) => p.version)).toEqual(["7.41b", "7.41a", "7.41", "7.40"]);
    expect(page1.nextCursor).toBe("7.40");
    expect(page1.items[0]).toEqual({
      version: "7.41b",
      name: "7.41b",
      publishedAt: expect.any(Date),
      sourceUrl: "https://www.dota2.com/patches/7.41b",
      parseStatus: "parsed",
      fetchedAt: expect.any(Date),
      summary: expect.objectContaining({ heroesChanged: 0 }),
    });

    const page2 = await queries.list({ limit: 4, cursor: page1.nextCursor });
    expect(page2.items.map((p) => p.version)).toEqual(["7.39", "7.08"]);
    expect(page2.nextCursor).toBeNull();
    expect(await queries.list({ cursor: "garbage" })).toEqual({ items: [], nextCursor: null });
    expect((await queries.latest())?.version).toBe("7.41b");
  });

  it("gets a patch by version (case-insensitive) and returns null when unknown", async () => {
    const { svc } = service();
    await svc.importVersion("7.41f");
    const queries = new PatchReadRepository(async () => db);
    const p = await queries.getByVersion("7.41F");
    expect(p).toMatchObject({ version: "7.41f", parseStatus: "parsed", parseRevision: 1 });
    expect(p && "_id" in p).toBe(false);
    expect(await queries.getByVersion("7.99")).toBeNull();
    expect(await queries.getByVersion("{$ne:1}")).toBeNull();
  });

  it("lets only one caller claim a refresh within the retry window", async () => {
    const repo = new PatchRefreshStateRepository(async () => db);
    const now = new Date("2026-09-30T00:00:00Z");
    const claims = await Promise.all(Array.from({ length: 5 }, () => repo.tryClaim(now, 60_000)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await repo.tryClaim(new Date(now.getTime() + 60_000), 60_000)).toBe(true);
    await repo.recordSuccess(now);
    expect(await repo.get()).toEqual({
      lastAttemptAt: new Date(now.getTime() + 60_000),
      lastSuccessAt: now,
    });
  });
});
