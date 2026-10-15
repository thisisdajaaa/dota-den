import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MatchExtras } from "@/modules/matches/domain/match-extras";
import type { ImportedPlayerMatch } from "@/modules/matches/matches.ports";
import { MatchExtrasRepository } from "@/modules/matches/repositories/match-extras.repository";
import { MatchFactsRepository } from "@/modules/matches/repositories/matches.repository";
import { toFact } from "@/modules/matches/services/match-sync.service";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await new MatchFactsRepository(async () => db).ensureIndexes();
  await new MatchExtrasRepository(async () => db).ensureIndexes();
});
afterAll(async () => teardown?.());

function fact(accountId32: number, matchId: string, day: number, parsed: boolean, heroId = 1) {
  const m: ImportedPlayerMatch = {
    accountId32,
    matchId,
    startedAt: new Date(Date.UTC(2026, 9, day)),
    durationSec: 2000,
    heroId,
    side: "radiant",
    result: day % 2 === 0 ? "win" : "loss",
    kills: 1,
    deaths: 2,
    assists: 3,
    gameMode: 22,
    lobbyType: 7,
    role: null,
    partySize: 1,
    averageRankTier: null,
    allyHeroIds: null,
    enemyHeroIds: null,
    provenance: {
      provider: "opendota",
      fetchedAt: new Date(),
      parseStatus: parsed ? "parsed" : "unparsed",
    },
  };
  return toFact(m, []);
}

const extras = (accountId32: number, matchId: string, over: Partial<MatchExtras> = {}) => ({
  accountId32,
  matchId,
  heroId: 1,
  startedAt: new Date("2026-10-01T00:00:00Z"),
  result: "win" as const,
  parsed: true,
  laneRole: 1,
  roaming: false,
  efficiencyPct: 70,
  laneResult: "won" as const,
  itemTimings: [{ key: "bfury", time: 900 }],
  ...over,
});

describe("MatchExtrasRepository", () => {
  it("lists parsed games without extras, newest first, and counts fetches for the cap", async () => {
    const facts = new MatchFactsRepository(async () => db);
    const repo = new MatchExtrasRepository(async () => db);
    await facts.upsertMany([
      fact(501, "a", 1, true),
      fact(501, "b", 2, false),
      fact(501, "c", 3, true),
      fact(501, "d", 4, true, 2),
      fact(502, "e", 5, true),
    ]);
    await repo.save(extras(501, "c"), new Date());
    await repo.save(extras(501, "old", { parsed: false }), new Date("2026-01-01T00:00:00Z"));

    const pending = await repo.pendingParsed(501, 10);
    expect(pending.map((p) => p.matchId)).toEqual(["d", "a"]);
    expect(pending[0]).toMatchObject({ heroId: 2, side: "radiant", result: "win" });
    expect(await repo.pendingParsed(501, 1)).toHaveLength(1);
    expect(await repo.fetchedSince(501, new Date(Date.now() - 86_400_000))).toBe(1);

    // Saving again replaces, never duplicates.
    await repo.save(extras(501, "c", { efficiencyPct: 80 }), new Date());
    const onHero = await repo.forHero(501, 1);
    expect(onHero).toHaveLength(1);
    expect(onHero[0]).toMatchObject({ matchId: "c", efficiencyPct: 80 });
    expect(onHero[0]).not.toHaveProperty("_id");
    expect(await repo.parsedGamesOnHero(501, 1)).toBe(2);
  });

  it("exports and deletes only the owner's extras", async () => {
    const repo = new MatchExtrasRepository(async () => db);
    await repo.save(extras(601, "x"), new Date());
    await repo.save(extras(602, "y"), new Date());
    const exported = await repo.exportForOwner({ accountId32: 601 });
    expect(exported).toEqual([
      expect.objectContaining({
        id: "601:x",
        matchId: "x",
        itemTimings: [{ key: "bfury", time: 900 }],
      }),
    ]);
    expect(await repo.deleteForOwner({ accountId32: 601 })).toBe(1);
    expect(await repo.forHero(601, 1)).toEqual([]);
    expect(await repo.forHero(602, 1)).toHaveLength(1);
  });
});
