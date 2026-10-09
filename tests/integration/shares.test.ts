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
});
