import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pairOf, type PairClassification } from "@/modules/together/domain/pair";
import {
  ensureTogetherIndexes,
  MongoTogetherRepository,
  TOGETHER_COLLECTIONS,
} from "@/modules/together/infrastructure/mongo-together-repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await ensureTogetherIndexes(db);
});
afterAll(async () => teardown?.());

const seat = { side: "radiant" as const, heroId: 1, partyId: 5, partySize: 2 };

function row(matchId: string, x: number, y: number, over: Partial<PairClassification> = {}) {
  return {
    ...pairOf(x, y),
    matchId,
    relation: "party" as const,
    startedAt: new Date("2026-09-01T00:00:00Z"),
    radiantWin: true,
    seatA: seat,
    seatB: seat,
    fetchedAt: new Date("2026-09-02T00:00:00Z"),
    ...over,
  } satisfies PairClassification;
}

describe("together_matches (Mongo)", () => {
  it("creates a unique index on (matchId, pair)", async () => {
    const indexes = await db.collection(TOGETHER_COLLECTIONS.matches).indexes();
    const uniq = indexes.find((i) => i.name === "uniq_match_pair");
    expect(uniq).toMatchObject({ key: { matchId: 1, accountIdA: 1, accountIdB: 1 }, unique: true });
  });

  it("rejects a raw duplicate insert", async () => {
    const col = db.collection(TOGETHER_COLLECTIONS.matches);
    await col.insertOne({ matchId: "raw", accountIdA: 1, accountIdB: 2 });
    await expect(
      col.insertOne({ matchId: "raw", accountIdA: 1, accountIdB: 2 }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("stores one document per pair whichever direction it was looked up from", async () => {
    const repo = new MongoTogetherRepository(db);
    await repo.saveMany([row("100", 900, 30)]);
    // Same match, same pair, from the other side: updates rather than duplicates.
    await repo.saveMany([row("100", 30, 900, { relation: "same_team_unknown" })]);
    // Concurrent writes of the same row settle on the unique index without throwing.
    await Promise.all(Array.from({ length: 5 }, () => repo.saveMany([row("101", 30, 900)])));

    const docs = await db
      .collection(TOGETHER_COLLECTIONS.matches)
      .find({ matchId: { $in: ["100", "101"] } })
      .toArray();
    expect(docs).toHaveLength(2);
    expect(docs.every((d) => d.accountIdA === 30 && d.accountIdB === 900)).toBe(true);
    expect(docs.find((d) => d.matchId === "100")?.relation).toBe("same_team_unknown");

    const found = await repo.find(pairOf(900, 30), ["100", "101", "missing"]);
    expect(found.map((f) => f.matchId).sort()).toEqual(["100", "101"]);
    expect(found[0]).not.toHaveProperty("_id");
  });

  it("refuses to store an unordered pair", async () => {
    const repo = new MongoTogetherRepository(db);
    await expect(
      repo.saveMany([{ ...row("102", 1, 2), accountIdA: 2, accountIdB: 1 }]),
    ).rejects.toThrow(/ascending/);
  });

  it("lists party matches for an account on either side of the pair", async () => {
    const repo = new MongoTogetherRepository(db);
    await repo.saveMany([
      row("200", 500, 10), // 500 stored as B
      row("201", 500, 9000), // 500 stored as A
      row("202", 500, 11, { relation: "opponents" }),
      row("203", 12, 13),
    ]);
    const party = await repo.partyMatchesOf(500);
    expect(party.map((p) => p.matchId).sort()).toEqual(["200", "201"]);
  });
});
