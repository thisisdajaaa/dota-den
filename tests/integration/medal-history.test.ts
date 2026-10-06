import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MedalHistoryRepository } from "@/modules/mmr/repositories/medal-history.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let repo: MedalHistoryRepository;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  repo = new MedalHistoryRepository(async () => db);
  await repo.ensureIndexes();
});
afterAll(async () => teardown?.());

const at = (d: string) => new Date(`2026-10-${d}T12:00:00Z`);

describe("medal history in Mongo", () => {
  it("adds a row only on change, and dates the last sighting of each medal", async () => {
    await repo.recordSighting(7, 63, at("01"));
    await repo.recordSighting(7, 63, at("03"));
    await repo.recordSighting(7, null, at("04")); // unknown medal: ignored
    await repo.recordSighting(7, 64, at("05"));
    await repo.recordSighting(8, 11, at("05")); // another account stays separate

    const rows = await repo.history(7);
    expect(rows.map((r) => [r.rankTier, r.observedAt, r.lastSeenAt])).toEqual([
      [63, at("01"), at("03")],
      [64, at("05"), at("05")],
    ]);
  });

  it("merges repeats written by two page loads at the same moment", async () => {
    await Promise.all([repo.recordSighting(9, 55, at("06")), repo.recordSighting(9, 55, at("06"))]);
    expect((await repo.history(9)).map((r) => r.rankTier)).toEqual([55]);
  });
});
