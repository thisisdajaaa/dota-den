import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureMedalHistoryIndexes,
  medalHistory,
  recordMedalSighting,
} from "@/modules/mmr/infrastructure/mongo-medal-history";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await ensureMedalHistoryIndexes(db);
});
afterAll(async () => teardown?.());

const at = (d: string) => new Date(`2026-10-${d}T12:00:00Z`);

describe("medal history in Mongo", () => {
  it("adds a row only on change, and dates the last sighting of each medal", async () => {
    await recordMedalSighting(db, 7, 63, at("01"));
    await recordMedalSighting(db, 7, 63, at("03"));
    await recordMedalSighting(db, 7, null, at("04")); // unknown medal: ignored
    await recordMedalSighting(db, 7, 64, at("05"));
    await recordMedalSighting(db, 8, 11, at("05")); // another account stays separate

    const rows = await medalHistory(db, 7);
    expect(rows.map((r) => [r.rankTier, r.observedAt, r.lastSeenAt])).toEqual([
      [63, at("01"), at("03")],
      [64, at("05"), at("05")],
    ]);
  });
});
