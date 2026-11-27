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

  it("fetches games stored before lane partners again, after new games, and keeps their data", async () => {
    const facts = new MatchFactsRepository(async () => db);
    const repo = new MatchExtrasRepository(async () => db);
    await facts.upsertMany([fact(611, "n", 1, true), fact(611, "s", 2, true)]);
    await repo.save(extras(611, "s", { heroId: 1, laneRole: 1 }), new Date());
    // Pretend "s" was stored before lane partners were kept.
    await db
      .collection("match_extras")
      .updateOne(
        { _id: "611:s" as never },
        { $set: { schemaVersion: 1 }, $unset: { lanePartnerHeroIds: "" } },
      );

    expect((await repo.pendingParsed(611, 10)).map((p) => p.matchId)).toEqual(["n", "s"]);
    expect((await repo.pendingParsed(611, 1)).map((p) => p.matchId)).toEqual(["n"]);
    expect(await repo.lanesForAccount(611)).toEqual([
      { matchId: "s", heroId: 1, laneRole: 1, roaming: false, laneResult: "won" },
    ]);

    // A refetch without a replay keeps the parsed game and stops asking for it.
    await repo.save(extras(611, "s", { parsed: false, laneRole: null }), new Date());
    expect((await repo.forHero(611, 1))[0]).toMatchObject({ matchId: "s", laneRole: 1 });
    expect((await repo.pendingParsed(611, 10)).map((p) => p.matchId)).toEqual(["n"]);

    await repo.save(
      extras(611, "s", {
        lanePartnerHeroIds: [5],
        laneOpponentHeroIds: [2, 3],
        teamGold: { at20: 3_000, maxLead: 4_000, maxDeficit: 500 },
      }),
      new Date(),
    );
    expect((await repo.lanesForAccount(611))[0]).toMatchObject({
      lanePartnerHeroIds: [5],
      laneOpponentHeroIds: [2, 3],
      teamGold: { at20: 3_000, maxLead: 4_000, maxDeficit: 500 },
    });

    // Wards: only parsed games stored with ward logs, newest first.
    expect(await repo.wardsForAccount(611, 10)).toEqual([]);
    const ward = { kind: "observer" as const, placedAt: 10, removedAt: 370, x: 100, y: 90 };
    await repo.save(extras(611, "s", { side: "dire", wards: [ward] }), new Date());
    expect(await repo.wardsForAccount(611, 10)).toEqual([
      expect.objectContaining({
        matchId: "s",
        heroId: 1,
        side: "dire",
        wards: [ward],
        runes: null,
      }),
    ]);
    const rune = { kind: "bounty" as const, time: 0 };
    await repo.save(extras(611, "s", { side: "dire", wards: [ward], runes: [rune] }), new Date());
    expect((await repo.wardsForAccount(611, 10))[0]?.runes).toEqual([rune]);
  });

  it("holds an account's run across servers until released or lapsed", async () => {
    const repo = new MatchExtrasRepository(async () => db);
    await db.collection("match_sync_state").insertOne({ accountId32: 701, lockedUntil: null });
    const t0 = new Date("2026-11-01T00:00:00Z");
    const later = (ms: number) => new Date(t0.getTime() + ms);

    expect(await repo.lease(701, t0, later(60_000))).toBe(true);
    // Held: another server's run is refused until the hold ends.
    expect(await repo.lease(701, later(1_000), later(61_000))).toBe(false);
    await repo.releaseLease(701, later(60_000));
    expect(await repo.lease(701, later(2_000), later(62_000))).toBe(true);
    // A crashed run's hold lapses; its late release doesn't end the new holder's.
    expect(await repo.lease(701, later(70_000), later(130_000))).toBe(true);
    await repo.releaseLease(701, later(62_000));
    expect(await repo.lease(701, later(71_000), later(131_000))).toBe(false);
    // An account that never synced has nothing to hold.
    expect(await repo.lease(702, t0, later(60_000))).toBe(false);
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
