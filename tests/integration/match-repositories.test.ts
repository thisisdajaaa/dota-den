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

function fact(accountId32: number, matchId: string, partySize: number | null = 1) {
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
    provenance: { provider: "opendota", fetchedAt: new Date(), parseStatus: "unparsed" },
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

  it("lists played heroes by games", async () => {
    expect(await new MatchReadRepository(async () => db).playedHeroes(ACCOUNT)).toEqual([
      { heroId: 1, games: 20 },
      { heroId: 14, games: 10 },
    ]);
  });
});
