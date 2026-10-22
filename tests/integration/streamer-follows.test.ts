import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StreamerFollow } from "@/modules/live/domain/streams";
import { LIVE_COLLECTIONS } from "@/modules/live/live.model";
import { StreamerFollowsRepository } from "@/modules/live/repositories/streamer-follows.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await new StreamerFollowsRepository(async () => db).ensureIndexes();
});
afterAll(async () => teardown?.());

const at = (iso: string) => new Date(iso);
const follow = (over: Partial<StreamerFollow> = {}): StreamerFollow => ({
  userId: "u",
  platform: "twitch",
  channelId: "1",
  login: "gorgc",
  displayName: "Gorgc",
  avatarUrl: null,
  createdAt: at("2026-10-01T00:00:00Z"),
  ...over,
});

describe("streamer follows (Mongo)", () => {
  it("creates the unique (user, site, channel) and per-user indexes", async () => {
    const indexes = await db.collection(LIVE_COLLECTIONS.streamerFollows).indexes();
    const byName = Object.fromEntries(indexes.map((i) => [i.name, i]));
    expect(byName.by_user_platform_channel).toMatchObject({
      key: { userId: 1, platform: 1, channelId: 1 },
      unique: true,
    });
    expect(byName.by_user_recent).toMatchObject({ key: { userId: 1, createdAt: -1 } });
  });

  it("adds idempotently, refreshing names, and stores schemaVersion", async () => {
    const repo = new StreamerFollowsRepository(async () => db);
    expect(await repo.add(follow({ userId: "idem" }))).toBe(true);
    expect(
      await repo.add(
        follow({ userId: "idem", login: "renamed", createdAt: at("2026-10-05T00:00:00Z") }),
      ),
    ).toBe(false);
    const stored = await repo.find("idem", "twitch", "1");
    // Renames are picked up; the follow date stays the first one.
    expect(stored).toMatchObject({ login: "renamed", createdAt: at("2026-10-01T00:00:00Z") });
    const raw = await db.collection(LIVE_COLLECTIONS.streamerFollows).findOne({ userId: "idem" });
    expect(raw?.schemaVersion).toBe(1);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => repo.add(follow({ userId: "idem", channelId: "2" }))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repo.count("idem")).toBe(2);
  });

  it("treats the same id on two sites as two follows", async () => {
    const repo = new StreamerFollowsRepository(async () => db);
    await repo.add(follow({ userId: "sites" }));
    await repo.add(follow({ userId: "sites", platform: "kick", login: "gorgc-kick" }));
    expect(await repo.count("sites")).toBe(2);
    expect(await repo.remove("sites", "kick", "1")).toBe(true);
    expect((await repo.list("sites")).map((f) => f.platform)).toEqual(["twitch"]);
  });

  it("isolates users and lists newest first", async () => {
    const repo = new StreamerFollowsRepository(async () => db);
    await repo.add(
      follow({ userId: "alice", channelId: "10", createdAt: at("2026-10-01T00:00:00Z") }),
    );
    await repo.add(
      follow({ userId: "alice", channelId: "11", createdAt: at("2026-10-03T00:00:00Z") }),
    );
    await repo.add(follow({ userId: "bob", channelId: "10" }));
    expect((await repo.list("alice")).map((f) => f.channelId)).toEqual(["11", "10"]);
    expect(await repo.remove("bob", "twitch", "11")).toBe(false);
    expect(await repo.remove("alice", "twitch", "10")).toBe(true);
    expect(await repo.find("bob", "twitch", "10")).not.toBeNull();
  });

  it("lists every follow of several users at once (go-live alerts)", async () => {
    const repo = new StreamerFollowsRepository(async () => db);
    await repo.add(follow({ userId: "many-a", channelId: "1" }));
    await repo.add(follow({ userId: "many-a", channelId: "2" }));
    await repo.add(follow({ userId: "many-b", channelId: "1" }));
    await repo.add(follow({ userId: "many-c", channelId: "1" }));
    const found = await repo.forUsers(["many-a", "many-b", "many-a"]);
    expect(found.map((f) => `${f.userId}:${f.channelId}`).sort()).toEqual([
      "many-a:1",
      "many-a:2",
      "many-b:1",
    ]);
    expect(await repo.forUsers([])).toEqual([]);
  });

  it("exports and deletes one owner's follows only", async () => {
    const repo = new StreamerFollowsRepository(async () => db);
    await repo.add(follow({ userId: "gdpr", channelId: "1" }));
    await repo.add(follow({ userId: "keep", channelId: "1" }));
    const owner = { userId: "gdpr", accountId32: 1 };
    const exported = await repo.exportForOwner(owner);
    expect(exported).toHaveLength(1);
    expect(exported[0]).not.toHaveProperty("schemaVersion");
    expect(exported[0]).toMatchObject({ platform: "twitch", login: "gorgc" });
    expect(await repo.deleteForOwner(owner)).toBe(1);
    expect(await repo.count("keep")).toBe(1);
  });
});
