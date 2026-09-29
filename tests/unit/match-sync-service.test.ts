import { describe, expect, it } from "vitest";
import type {
  ImportedPlayerMatch,
  LockOutcome,
  MatchProvider,
  PlayerMatchFactRepository,
  SyncState,
  SyncStateRepository,
} from "@/modules/matches/application/ports";
import {
  MatchSyncService,
  SYNC_COOLDOWN_MS,
} from "@/modules/matches/application/match-sync-service";
import type { PlayerMatchFact } from "@/modules/matches/domain/player-match-fact";
import { err, ok } from "@/modules/shared/domain/result";

const ACCOUNT = 22202;
const HOUR = 3_600_000;

function imported(i: number, overrides: Partial<ImportedPlayerMatch> = {}): ImportedPlayerMatch {
  return {
    accountId32: ACCOUNT,
    matchId: String(1000 + i),
    startedAt: new Date(Date.UTC(2026, 4, 1) + i * HOUR),
    durationSec: 2000,
    heroId: 1,
    side: "radiant",
    result: "win",
    kills: 1,
    deaths: 1,
    assists: 1,
    gameMode: 22,
    lobbyType: 7,
    role: null,
    partySize: 1,
    averageRankTier: null,
    provenance: { provider: "opendota", fetchedAt: new Date(), parseStatus: "unparsed" },
    ...overrides,
  };
}

/** Upstream history, newest first, like OpenDota. */
class FakeUpstream implements MatchProvider {
  calls: Array<{ offset: number; limit: number }> = [];
  failOnCall: number | null = null;
  constructor(public history: ImportedPlayerMatch[]) {}
  add(m: ImportedPlayerMatch) {
    this.history.unshift(m);
  }
  async fetchPlayerMatches(_id: number, page: { offset: number; limit: number }) {
    this.calls.push(page);
    if (this.failOnCall === this.calls.length)
      return err({ type: "unavailable" as const, cause: "boom" });
    return ok({
      matches: this.history.slice(page.offset, page.offset + page.limit),
      rejectedCount: 0,
    });
  }
  async fetchPlayerProfile() {
    return err({ type: "not_found" as const });
  }
}

class MemoryFacts implements PlayerMatchFactRepository {
  byKey = new Map<string, PlayerMatchFact>();
  async upsertMany(facts: readonly PlayerMatchFact[]) {
    let inserted = 0;
    let updated = 0;
    for (const f of facts) {
      const key = `${f.accountId32}:${f.matchId}`;
      if (this.byKey.has(key)) updated++;
      else inserted++;
      this.byKey.set(key, f);
    }
    return { inserted, updated };
  }
}

class MemorySyncState implements SyncStateRepository {
  state: (SyncState & { lockedUntil: Date | null }) | null = null;
  async acquire(
    accountId32: number,
    { now, lockTtlMs, cooldownMs }: { now: Date; lockTtlMs: number; cooldownMs: number },
  ): Promise<LockOutcome> {
    this.state ??= {
      accountId32,
      lastSyncAt: null,
      newestStartedAt: null,
      backfillOffset: 0,
      backfillComplete: false,
      lockedUntil: null,
    };
    if (this.state.lockedUntil && this.state.lockedUntil > now) return { type: "locked" };
    if (this.state.lastSyncAt && now.getTime() - this.state.lastSyncAt.getTime() < cooldownMs) {
      return { type: "cooldown", retryAt: new Date(this.state.lastSyncAt.getTime() + cooldownMs) };
    }
    this.state.lockedUntil = new Date(now.getTime() + lockTtlMs);
    return { type: "acquired", state: { ...this.state } };
  }
  async release(_id: number, next: Omit<SyncState, "accountId32">) {
    Object.assign(this.state!, next, { lockedUntil: null });
  }
  async abandon() {
    this.state!.lockedUntil = null;
  }
  async get() {
    return this.state;
  }
}

function setup(historySize: number, opts: { pageSize?: number; maxPages?: number } = {}) {
  let now = new Date("2026-09-29T12:00:00Z");
  const history = Array.from({ length: historySize }, (_, i) => imported(historySize - 1 - i));
  const upstream = new FakeUpstream(history);
  const facts = new MemoryFacts();
  const syncState = new MemorySyncState();
  const service = new MatchSyncService({
    provider: upstream,
    patches: {
      getTimeline: async () => ok([{ name: "7.41", releasedAt: new Date("2026-03-24T00:00:00Z") }]),
    },
    facts,
    syncState,
    now: () => now,
    pageSize: opts.pageSize ?? 10,
    maxPages: opts.maxPages ?? 3,
  });
  return {
    service,
    upstream,
    facts,
    syncState,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

describe("MatchSyncService", () => {
  it("imports a short history in one sync and applies domain policies", async () => {
    const ctx = setup(7);
    const res = await ctx.service.sync(ACCOUNT);
    expect(res).toEqual({
      ok: true,
      value: { fetched: 7, inserted: 7, updated: 0, rejected: 0, backfillComplete: true },
    });
    const fact = [...ctx.facts.byKey.values()][0];
    expect(fact.queue.queueClass).toBe("solo");
    expect(fact.ranked).toBe(true);
    expect(fact.patch).toEqual({ patch: "7.41", certainty: "confident" });
  });

  it("backfills long histories across syncs within the page budget", async () => {
    const ctx = setup(45);
    const first = await ctx.service.sync(ACCOUNT);
    expect(first.ok && first.value).toMatchObject({ fetched: 30, backfillComplete: false });

    ctx.advance(SYNC_COOLDOWN_MS + 1);
    const second = await ctx.service.sync(ACCOUNT);
    expect(second.ok && second.value).toMatchObject({ backfillComplete: true });
    expect(ctx.facts.byKey.size).toBe(45);
  });

  it("picks up new matches at the head and keeps backfill offsets aligned", async () => {
    const ctx = setup(25, { maxPages: 2 });
    await ctx.service.sync(ACCOUNT); // 20 of 25
    for (let i = 100; i < 103; i++) ctx.upstream.add(imported(i));

    ctx.advance(SYNC_COOLDOWN_MS + 1);
    const res = await ctx.service.sync(ACCOUNT);
    expect(res.ok && res.value.backfillComplete).toBe(true);
    expect(ctx.facts.byKey.size).toBe(28);
  });

  it("is idempotent: re-syncing the same history inserts nothing new", async () => {
    const ctx = setup(5);
    await ctx.service.sync(ACCOUNT);
    ctx.advance(SYNC_COOLDOWN_MS + 1);
    const res = await ctx.service.sync(ACCOUNT);
    expect(res.ok && res.value.inserted).toBe(0);
    expect(ctx.facts.byKey.size).toBe(5);
  });

  it("enforces the cooldown between syncs", async () => {
    const ctx = setup(3);
    await ctx.service.sync(ACCOUNT);
    expect(await ctx.service.sync(ACCOUNT)).toMatchObject({
      ok: false,
      error: { type: "cooldown" },
    });
  });

  it("rejects a concurrent sync for the same account", async () => {
    const ctx = setup(3);
    const [a, b] = await Promise.all([ctx.service.sync(ACCOUNT), ctx.service.sync(ACCOUNT)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ error: { type: "sync_in_progress" } });
  });

  it("releases the lock without recording a sync when the provider fails", async () => {
    const ctx = setup(30);
    ctx.upstream.failOnCall = 2;
    expect(await ctx.service.sync(ACCOUNT)).toMatchObject({
      ok: false,
      error: { type: "provider" },
    });
    expect(ctx.syncState.state).toMatchObject({ lockedUntil: null, lastSyncAt: null });
    // Immediately retryable.
    ctx.upstream.failOnCall = null;
    expect((await ctx.service.sync(ACCOUNT)).ok).toBe(true);
  });

  it("imports with unknown patch labels when the patch timeline is unavailable", async () => {
    const ctx = setup(2);
    const service = new MatchSyncService({
      provider: ctx.upstream,
      patches: { getTimeline: async () => err({ type: "unavailable", cause: "down" }) },
      facts: ctx.facts,
      syncState: ctx.syncState,
    });
    expect((await service.sync(ACCOUNT)).ok).toBe(true);
    expect([...ctx.facts.byKey.values()][0].patch).toEqual({ patch: null, certainty: "unknown" });
  });
});
