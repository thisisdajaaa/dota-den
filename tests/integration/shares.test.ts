import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SharesRepository } from "@/modules/shares/repositories/shares.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
let repo: SharesRepository;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  repo = new SharesRepository(async () => db);
  await repo.ensureIndexes();
});
afterAll(async () => teardown?.());

const snapshot = (games: number) => ({
  kind: "week" as const,
  from: "2026-10-05",
  to: "2026-10-11",
  games,
  wins: games,
  losses: 0,
  mostPlayed: null,
  best: null,
});

describe("SharesRepository", () => {
  it("keeps the first slug and refreshes the snapshot when shared again", async () => {
    const input = { userId: "u1", kind: "week" as const, ref: "2026-10-05", playerName: "A" };
    const t1 = new Date("2026-10-08T00:00:00Z");
    const t2 = new Date("2026-10-09T00:00:00Z");
    const a = await repo.upsert({ ...input, snapshot: snapshot(2) }, "AAAAAAAAAAAA", t1);
    const b = await repo.upsert({ ...input, snapshot: snapshot(5) }, "BBBBBBBBBBBB", t2);
    expect(b._id).toBe(a._id);
    expect(b.snapshot.games).toBe(5);
    expect(b.createdAt).toEqual(t1);
    expect((await repo.listForUser("u1")).map((d) => d._id)).toEqual(["AAAAAAAAAAAA"]);
  });

  it("removes only the owner's link, and everything with the account", async () => {
    expect(await repo.remove("u2", "AAAAAAAAAAAA")).toBe(false);
    expect(await repo.deleteForOwner({ userId: "u1", accountId32: 1 })).toBe(1);
    expect(await repo.find("AAAAAAAAAAAA")).toBeNull();
  });

  it("stores a journey per range, with its dates intact", async () => {
    const at = new Date("2026-07-01T00:00:00Z");
    const journey = {
      kind: "journey" as const,
      range: "6m" as const,
      from: new Date("2026-04-16T00:00:00Z"),
      to: new Date("2026-10-16T00:00:00Z"),
      medals: [{ rankTier: 52, at, carried: false }],
      lastSeenAt: at,
      peak: { rankTier: 52, at },
      low: { rankTier: 52, at },
      climb: null,
      slide: null,
      games: 0,
      wins: 0,
      losses: 0,
      heroes: [],
    };
    const input = { userId: "u3", kind: "journey" as const, playerName: null, snapshot: journey };
    await repo.upsert({ ...input, ref: "6m" }, "CCCCCCCCCCCC", at);
    await repo.upsert({ ...input, ref: "1y" }, "DDDDDDDDDDDD", at);
    const found = await repo.find("CCCCCCCCCCCC");
    expect(found?.snapshot).toEqual(journey);
    expect(await repo.listForUser("u3")).toHaveLength(2);
  });
});
