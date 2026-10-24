import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toFact } from "@/modules/matches/services/match-sync.service";
import type { ImportedPlayerMatch } from "@/modules/matches/matches.ports";
import {
  MATCH_COLLECTIONS,
  MatchReadRepository,
  MatchFactsRepository,
  SyncStatesRepository,
} from "@/modules/matches/repositories/matches.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await new MatchFactsRepository(async () => db).ensureIndexes();
});
afterAll(async () => teardown?.());

function fact(
  accountId32: number,
  matchId: string,
  partySize: number | null = 1,
  overrides: Partial<ImportedPlayerMatch> = {},
) {
  const m: ImportedPlayerMatch = {
    accountId32,
    matchId,
    startedAt: new Date("2026-05-01T18:00:00Z"),
    durationSec: 2000,
    heroId: 1,
    side: "radiant",
    result: "win",
    kills: 1,
    deaths: 2,
    assists: 3,
    gameMode: 22,
    lobbyType: 7,
    role: null,
    partySize,
    averageRankTier: null,
    allyHeroIds: [2, 3, 4, 5],
    enemyHeroIds: [6, 7, 8, 9, 10],
    provenance: { provider: "opendota", fetchedAt: new Date(), parseStatus: "unparsed" },
    ...overrides,
  };
  return toFact(m, []);
}

describe("MatchFactsRepository", () => {
  it("upserts idempotently per (account, match) and shares one match record", async () => {
    const repo = new MatchFactsRepository(async () => db);
    expect(await repo.upsertMany([fact(1, "m1"), fact(2, "m1")])).toEqual({
      inserted: 2,
      updated: 0,
    });
    expect(await repo.upsertMany([fact(1, "m1", null)])).toEqual({ inserted: 0, updated: 1 });

    const facts = db.collection(MATCH_COLLECTIONS.facts);
    expect(await facts.countDocuments({ matchId: "m1" })).toBe(2);
    expect((await facts.findOne({ accountId32: 1, matchId: "m1" }))?.queue.queueClass).toBe(
      "unknown",
    );
    expect(await db.collection(MATCH_COLLECTIONS.matches).countDocuments({ matchId: "m1" })).toBe(
      1,
    );
  });

  it("handles an empty batch", async () => {
    expect(await new MatchFactsRepository(async () => db).upsertMany([])).toEqual({
      inserted: 0,
      updated: 0,
    });
  });
});

describe("MatchReadRepository.heroFacts", () => {
  it("reads the whole history, or one hero's games, past the dashboard's 5,000", async () => {
    const repo = new MatchFactsRepository(async () => db);
    const facts = Array.from({ length: 5_010 }, (_, i) =>
      fact(81, `hf${i}`, 1, {
        heroId: i < 10 ? 74 : 1,
        startedAt: new Date(Date.UTC(2020, 0, 1) + i * 3_600_000),
      }),
    );
    await repo.upsertMany(facts);
    const q = new MatchReadRepository(async () => db);
    expect((await q.heroFacts(81)).length).toBe(5_010);
    const invoker = await q.heroFacts(81, 74);
    // The ten oldest games: beyond the newest 5,000 the dashboard reads.
    expect(invoker.map((f) => f.heroId)).toEqual(Array(10).fill(74));
    expect(invoker[0].startedAt.getTime()).toBeGreaterThan(invoker[9].startedAt.getTime());
  });
});

describe("MatchReadRepository.markParsed", () => {
  it("flips the stored rows of a match parsed after import, for those players only", async () => {
    const repo = new MatchFactsRepository(async () => db);
    await repo.upsertMany([fact(71, "mp1"), fact(72, "mp1"), fact(71, "mp2")]);
    await new MatchReadRepository(async () => db).markParsed("mp1", [71, 72, 99]);
    const facts = db.collection(MATCH_COLLECTIONS.facts);
    const status = async (accountId32: number, matchId: string) =>
      (await facts.findOne({ accountId32, matchId }))?.provenance.parseStatus;
    expect(await status(71, "mp1")).toBe("parsed");
    expect(await status(72, "mp1")).toBe("parsed");
    expect(await status(71, "mp2")).toBe("unparsed");
  });
});

describe("SyncStatesRepository", () => {
  const opts = (now: Date) => ({
    now,
    lockTtlMs: 60_000,
    cooldownMs: 300_000,
    backfillCooldownMs: 30_000,
  });

  it("lets exactly one concurrent caller acquire the lock", async () => {
    const repo = new SyncStatesRepository(async () => db);
    const now = new Date();
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => repo.acquire(42, opts(now))),
    );
    expect(outcomes.filter((o) => o.type === "acquired")).toHaveLength(1);
    expect(outcomes.filter((o) => o.type === "locked")).toHaveLength(4);
  });

  it("applies cooldown after release and allows reacquire after it", async () => {
    const repo = new SyncStatesRepository(async () => db);
    const t0 = new Date("2026-09-29T00:00:00Z");
    expect((await repo.acquire(43, opts(t0))).type).toBe("acquired");
    await repo.release(43, {
      lastSyncAt: t0,
      newestStartedAt: null,
      backfillOffset: 0,
      backfillComplete: true,
      historyRefreshRequestedAt: null,
      rescannedAt: null,
      lineupBackfillOffset: 0,
      lineupBackfillComplete: true,
    });

    const during = await repo.acquire(43, opts(new Date(t0.getTime() + 1000)));
    expect(during).toEqual({ type: "cooldown", retryAt: new Date(t0.getTime() + 300_000) });
    expect((await repo.acquire(43, opts(new Date(t0.getTime() + 300_001)))).type).toBe("acquired");
  });

  it("uses the shorter backfill cooldown while history is incomplete", async () => {
    const repo = new SyncStatesRepository(async () => db);
    const t0 = new Date("2026-09-29T00:00:00Z");
    await repo.acquire(45, opts(t0));
    await repo.release(45, {
      lastSyncAt: t0,
      newestStartedAt: null,
      backfillOffset: 500,
      backfillComplete: false,
      historyRefreshRequestedAt: null,
      rescannedAt: null,
      lineupBackfillOffset: 0,
      lineupBackfillComplete: true,
    });
    expect(await repo.acquire(45, opts(new Date(t0.getTime() + 10_000)))).toEqual({
      type: "cooldown",
      retryAt: new Date(t0.getTime() + 30_000),
    });
    expect((await repo.acquire(45, opts(new Date(t0.getTime() + 30_001)))).type).toBe("acquired");
  });

  it("recovers from an expired lock and from abandon", async () => {
    const repo = new SyncStatesRepository(async () => db);
    const t0 = new Date("2026-09-29T00:00:00Z");
    await repo.acquire(44, opts(t0));
    expect((await repo.acquire(44, opts(new Date(t0.getTime() + 60_001)))).type).toBe("acquired");
    await repo.abandon(44);
    expect((await repo.acquire(44, opts(new Date(t0.getTime() + 60_002)))).type).toBe("acquired");
  });

  it("lists accounts due a background sync, longest wait first", async () => {
    const repo = new SyncStatesRepository(async () => db);
    const release = async (id: number, lastSyncAt: Date, backfillComplete: boolean) => {
      await repo.acquire(id, opts(lastSyncAt));
      await repo.release(id, {
        lastSyncAt,
        newestStartedAt: null,
        backfillOffset: 0,
        backfillComplete,
        historyRefreshRequestedAt: null,
        rescannedAt: null,
        lineupBackfillOffset: 0,
        lineupBackfillComplete: true,
      });
    };
    await release(70, new Date("2026-09-20T00:00:00Z"), true);
    await release(71, new Date("2026-09-29T00:00:00Z"), false);
    await release(72, new Date("2026-09-10T00:00:00Z"), true);
    const mine = (await repo.dueForSync(100)).filter((id) => id >= 70 && id <= 72);
    // 71 is still importing but synced most recently, so it doesn't jump the queue.
    expect(mine).toEqual([72, 70, 71]);
  });
});

describe("MatchReadRepository.listMatches", () => {
  const ACCOUNT = 777;
  const all = { range: "all", mode: "all", queue: "all", result: "all" } as const;

  beforeAll(async () => {
    const repo = new MatchFactsRepository(async () => db);
    const facts = Array.from({ length: 30 }, (_, i) => {
      const f = fact(ACCOUNT, `L${String(i).padStart(3, "0")}`, i % 3 === 0 ? null : i % 3);
      return {
        ...f,
        startedAt: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000),
        result: i % 2 === 0 ? ("win" as const) : ("loss" as const),
        heroId: i < 10 ? 14 : 1,
      };
    });
    await repo.upsertMany(facts);
  });

  it("pages newest-first with a cursor, without gaps or duplicates", async () => {
    const q = new MatchReadRepository(async () => db);
    const now = new Date("2026-02-01");
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const page = await q.listMatches(ACCOUNT, { ...all, cursor }, now, 12);
      seen.push(...page.items.map((m) => m.matchId));
      expect(page.record).toEqual({ games: 30, wins: 15 });
      expect(page.matching).toBe(30);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
    expect(seen[0]).toBe("L029");
  });

  it("applies queue, result and hero filters to items and totals alike", async () => {
    const q = new MatchReadRepository(async () => db);
    const now = new Date("2026-02-01");
    const unknown = await q.listMatches(ACCOUNT, { ...all, queue: "unknown" }, now, 50);
    expect(unknown.record.games).toBe(10);
    expect(unknown.matching).toBe(10);
    expect(unknown.items.every((m) => m.queueClass === "unknown")).toBe(true);

    const pudgeWins = await q.listMatches(ACCOUNT, { ...all, hero: 14, result: "win" }, now, 50);
    expect(pudgeWins.items).toHaveLength(5);
    // The list is wins only; the record keeps the losses on that hero for context.
    expect(pudgeWins.matching).toBe(5);
    expect(pudgeWins.record).toEqual({ games: 10, wins: 5 });
  });

  it("lists matches started after a time, oldest first, skipping given ones (Discord feed)", async () => {
    const q = new MatchReadRepository(async () => db);
    const rows = await q.startedAfter(ACCOUNT, new Date(Date.UTC(2026, 0, 1) + 25 * 3_600_000), {
      excludeMatchIds: ["L027"],
      limit: 3,
    });
    expect(rows.map((r) => r.matchId)).toEqual(["L026", "L028", "L029"]);
    expect(rows[0]).toMatchObject({ gameMode: 22, kills: 1, deaths: 2, assists: 3, ranked: true });
    expect(rows[0]).toMatchObject({ queueClass: "party", partySize: 2 });
  });

  it("lists played heroes by games", async () => {
    expect(await new MatchReadRepository(async () => db).playedHeroes(ACCOUNT)).toEqual([
      { heroId: 1, games: 20 },
      { heroId: 14, games: 10 },
    ]);
  });
});

describe("Lineups (matchups from your own games)", () => {
  const NOW = new Date("2026-10-15T00:00:00Z");
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

  it("counts games stored before lineups were kept, reads lineups and reports coverage", async () => {
    const facts = new MatchFactsRepository(async () => db);
    const reads = new MatchReadRepository(async () => db);
    const ACC = 8801;
    await facts.upsertMany([
      fact(ACC, "l1", 1, { startedAt: daysAgo(5), heroId: 1 }),
      fact(ACC, "l2", 1, { startedAt: daysAgo(60), heroId: 2, lobbyType: 0 }),
      // The upstream had no lineup for this one: missing, not empty.
      fact(ACC, "l3", 1, { startedAt: daysAgo(200), allyHeroIds: null, enemyHeroIds: null }),
    ]);
    // A fact as an older version stored it: schema version 1, no lineup fields.
    const legacy = { ...fact(ACC, "l4", 1, { startedAt: daysAgo(300) }) } as Record<
      string,
      unknown
    >;
    delete legacy.allyHeroIds;
    delete legacy.enemyHeroIds;
    await db.collection(MATCH_COLLECTIONS.facts).insertOne({ ...legacy, schemaVersion: 1 });

    expect(await facts.countWithoutLineups(ACC)).toBe(1);
    expect(await reads.lineupCoverage(ACC)).toEqual({
      total: 4,
      withLineups: 2,
      pending: 1,
      complete: false,
    });

    const all = await reads.lineupFacts(ACC, { range: "all", mode: "all" }, NOW);
    expect(all.games.map((g) => [g.matchId, g.enemyHeroIds])).toEqual([
      ["l1", [6, 7, 8, 9, 10]],
      ["l2", [6, 7, 8, 9, 10]],
      ["l3", null],
      ["l4", null],
    ]);
    const recent = await reads.lineupFacts(ACC, { range: "90d", mode: "all" }, NOW);
    expect(recent.games.map((g) => g.matchId)).toEqual(["l1", "l2"]);
    const ranked = await reads.lineupFacts(ACC, { range: "30d", mode: "ranked" }, NOW);
    expect(ranked.games.map((g) => g.matchId)).toEqual(["l1"]);
    const onHero = await reads.lineupFacts(ACC, { range: "all", mode: "all", heroId: 2 }, NOW);
    expect(onHero.games.map((g) => g.matchId)).toEqual(["l2"]);

    // Re-imported with lineups: nothing left to backfill.
    await facts.upsertMany([fact(ACC, "l4", 1, { startedAt: daysAgo(300) })]);
    expect(await facts.countWithoutLineups(ACC)).toBe(0);
    expect(await reads.lineupCoverage(ACC)).toMatchObject({ withLineups: 3, complete: true });
  });

  it("reads sync state saved before the lineup backfill existed as not yet done", async () => {
    await db.collection(MATCH_COLLECTIONS.syncState).insertOne({
      accountId32: 8802,
      lastSyncAt: new Date("2026-09-01T00:00:00Z"),
      newestStartedAt: new Date("2026-09-01T00:00:00Z"),
      backfillOffset: 300,
      backfillComplete: true,
      lockedUntil: null,
    });
    expect(await new SyncStatesRepository(async () => db).get(8802)).toMatchObject({
      lineupBackfillOffset: 0,
      lineupBackfillComplete: false,
    });
  });
});
