import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FollowService } from "@/modules/players/services/follow.service";
import { FollowsRepository } from "@/modules/players/repositories/follows.repository";
import { PLAYER_COLLECTIONS } from "@/modules/players/players.model";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await new FollowsRepository(async () => db).ensureIndexes();
});
afterAll(async () => teardown?.());

const at = (iso: string) => new Date(iso);

describe("player follows (Mongo)", () => {
  it("creates the unique and per-user indexes", async () => {
    const indexes = await db.collection(PLAYER_COLLECTIONS.follows).indexes();
    const byName = Object.fromEntries(indexes.map((i) => [i.name, i]));
    expect(byName.by_user_account).toMatchObject({
      key: { userId: 1, accountId32: 1 },
      unique: true,
    });
    expect(byName.by_user_recent).toMatchObject({ key: { userId: 1, createdAt: -1 } });
  });

  it("adds idempotently and keeps one document per (user, account)", async () => {
    const repo = new FollowsRepository(async () => db);
    const follow = { userId: "u-idem", accountId32: 22202, createdAt: at("2026-09-01T00:00:00Z") };
    expect(await repo.add(follow)).toBe(true);
    expect(await repo.add({ ...follow, createdAt: at("2026-09-02T00:00:00Z") })).toBe(false);
    // Concurrent duplicates settle on the unique index without throwing.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => repo.add({ ...follow, accountId32: 33303 })),
    );
    expect(results.filter(Boolean)).toHaveLength(1);

    expect(await repo.count("u-idem")).toBe(2);
    expect(await repo.find("u-idem", 22202)).toEqual(follow);
  });

  it("rejects a raw duplicate insert (unique index)", async () => {
    const col = db.collection(PLAYER_COLLECTIONS.follows);
    await col.insertOne({ userId: "u-raw", accountId32: 1, createdAt: new Date() });
    await expect(
      col.insertOne({ userId: "u-raw", accountId32: 1, createdAt: new Date() }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("isolates users: listing, finding and removing are scoped by owner", async () => {
    const repo = new FollowsRepository(async () => db);
    await repo.add({ userId: "alice", accountId32: 10, createdAt: at("2026-09-01T00:00:00Z") });
    await repo.add({ userId: "alice", accountId32: 11, createdAt: at("2026-09-03T00:00:00Z") });
    await repo.add({ userId: "bob", accountId32: 10, createdAt: at("2026-09-02T00:00:00Z") });

    expect((await repo.list("alice")).map((f) => f.accountId32)).toEqual([11, 10]);
    expect((await repo.list("bob")).map((f) => f.accountId32)).toEqual([10]);
    expect(await repo.find("bob", 11)).toBeNull();

    expect(await repo.remove("bob", 11)).toBe(false);
    expect(await repo.remove("bob", 10)).toBe(true);
    expect((await repo.list("alice")).map((f) => f.accountId32)).toEqual([11, 10]);
    expect(await repo.list("bob")).toEqual([]);
  });

  it("works end to end with the service limit", async () => {
    const service = new FollowService(new FollowsRepository(async () => db), { limit: 2 });
    const owner = { userId: "carol", accountId32: 999 };
    expect((await service.follow(owner, 1)).ok).toBe(true);
    expect((await service.follow(owner, 2)).ok).toBe(true);
    expect(await service.follow(owner, 3)).toEqual({
      ok: false,
      error: { type: "limit_reached", limit: 2 },
    });
    expect(await service.unfollow(owner, 1)).toBe(true);
    expect((await service.follow(owner, 3)).ok).toBe(true);
    expect((await service.list(owner)).map((f) => f.accountId32).sort()).toEqual([2, 3]);
  });
});
