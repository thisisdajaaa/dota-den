import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PlayerProfilesRepository } from "@/modules/players/repositories/player-profiles.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
});
afterAll(async () => teardown?.());

describe("PlayerProfilesRepository", () => {
  it("saves, overwrites and reads profiles in one query, with a 30-day expiry", async () => {
    const repo = new PlayerProfilesRepository(async () => db);
    await repo.ensureIndexes();
    const p = {
      accountId32: 22202,
      personaName: "A",
      avatarUrl: null,
      matchHistory: "full" as const,
      rankTier: 55,
      leaderboardRank: null,
    };
    await repo.save(p, new Date("2026-10-14T00:00:00Z"));
    await repo.save({ ...p, personaName: "B" }, new Date("2026-10-15T00:00:00Z"));
    const got = await repo.getMany([22202, 1]);
    expect(got.size).toBe(1);
    expect(got.get(22202)).toMatchObject({ accountId32: 22202, personaName: "B" });
    const ttl = (await db.collection("player_profiles").indexes()).find((i) => i.name === "ttl");
    expect(ttl?.expireAfterSeconds).toBe(30 * 24 * 3600);
  });

  it("saves last-match times only for players already saved", async () => {
    const repo = new PlayerProfilesRepository(async () => db);
    const at = new Date("2026-10-15T00:00:00Z");
    await repo.save(
      {
        accountId32: 22203,
        personaName: "C",
        avatarUrl: null,
        matchHistory: "full",
        rankTier: null,
        leaderboardRank: null,
      },
      at,
    );
    expect((await repo.getMany([22203])).get(22203)?.lastMatch).toBeUndefined();
    await repo.saveLastMatch(22203, new Date("2026-10-14T20:00:00Z"), at);
    await repo.saveLastMatch(22204, null, at);
    const got = await repo.getMany([22203, 22204]);
    expect(got.get(22203)?.lastMatch).toEqual({
      at: new Date("2026-10-14T20:00:00Z"),
      fetchedAt: at,
    });
    expect(got.has(22204)).toBe(false);
  });
});
