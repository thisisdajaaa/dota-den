import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PatchWatchlistService } from "@/modules/patches/application/patch-watchlist-service";
import {
  ensurePatchIndexes,
  MongoPatchWatchlistRepository,
  PATCH_COLLECTIONS,
} from "@/modules/patches/infrastructure/mongo-patch-repositories";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await ensurePatchIndexes(db);
});
afterAll(async () => teardown?.());

const service = () =>
  new PatchWatchlistService({ watchlists: new MongoPatchWatchlistRepository(db) });

describe("patch watchlists", () => {
  it("returns an empty watchlist for a new user", async () => {
    expect(await service().get("nobody")).toEqual({
      userId: "nobody",
      heroIds: [],
      itemIds: [],
      updatedAt: null,
    });
  });

  it("adds and removes per user without touching other users", async () => {
    const svc = service();
    await svc.add("alice", { heroIds: [14, 1, 14], itemIds: [1] });
    await svc.add("bob", { heroIds: [1, 2] });
    await svc.add("alice", { heroIds: [99] });
    await svc.remove("alice", { heroIds: [1], itemIds: [1] });

    expect(await svc.get("alice")).toMatchObject({ heroIds: [14, 99], itemIds: [] });
    expect(await svc.get("bob")).toMatchObject({ heroIds: [1, 2], itemIds: [] });
    expect(await db.collection(PATCH_COLLECTIONS.watchlists).countDocuments()).toBe(2);
  });

  it("replaces the whole list and enforces the hero limit", async () => {
    const svc = service();
    const replaced = await svc.replace("carol", { heroIds: [3, 2, 1], itemIds: [7] });
    expect(replaced.ok && replaced.value).toMatchObject({ heroIds: [1, 2, 3], itemIds: [7] });

    const tooMany = await svc.add("carol", {
      heroIds: Array.from({ length: 48 }, (_, i) => i + 10),
    });
    expect(tooMany).toEqual({ ok: false, error: { type: "too_many_heroes", limit: 50 } });
    expect((await svc.get("carol")).heroIds).toEqual([1, 2, 3]);
  });

  it("keeps one document per user", async () => {
    await expect(
      db.collection(PATCH_COLLECTIONS.watchlists).insertOne({ userId: "alice" }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});
