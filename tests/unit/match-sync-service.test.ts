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
  BACKFILL_COOLDOWN_MS,
  HISTORY_REFRESH_INTERVAL_MS,
  MatchSyncService,
  PERIODIC_REFRESH_INTERVAL_MS,
  RESCAN_DELAY_MS,
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
  refreshRequests = 0;
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
  async requestHistoryRefresh() {
    this.refreshRequests++;
    return ok(true as const);
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
    {
      now,
      lockTtlMs,
      cooldownMs,
      backfillCooldownMs,
    }: { now: Date; lockTtlMs: number; cooldownMs: number; backfillCooldownMs: number },
  ): Promise<LockOutcome> {
    this.state ??= {
      accountId32,
      lastSyncAt: null,
      newestStartedAt: null,
      backfillOffset: 0,
      backfillComplete: false,
      historyRefreshRequestedAt: null,
      rescannedAt: null,
      lockedUntil: null,
    };
    if (this.state.lockedUntil && this.state.lockedUntil > now) return { type: "locked" };
    const wait = this.state.backfillComplete ? cooldownMs : backfillCooldownMs;
    if (this.state.lastSyncAt && now.getTime() - this.state.lastSyncAt.getTime() < wait) {
      return { type: "cooldown", retryAt: new Date(this.state.lastSyncAt.getTime() + wait) };
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
  async dueForSync() {
    return this.state ? [this.state.accountId32] : [];
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
      value: {
        fetched: 7,
        inserted: 7,
        updated: 0,
        rejected: 0,
        backfillComplete: true,
        historyRefreshRequested: true,
      },
    });
    const fact = [...ctx.facts.byKey.values()][0];
    expect(fact.queue.queueClass).toBe("solo");
    expect(fact.ranked).toBe(true);
    expect(fact.patch).toEqual({ patch: "7.41", certainty: "confident" });
  });

  it("backfills long histories across syncs, with the short backfill cooldown", async () => {
    const ctx = setup(45);
    const first = await ctx.service.sync(ACCOUNT);
    expect(first.ok && first.value).toMatchObject({ fetched: 30, backfillComplete: false });

    ctx.advance(BACKFILL_COOLDOWN_MS + 1);
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

  it("reports staleness against the applicable cooldown", () => {
    const now = new Date("2026-09-29T12:00:00Z");
    const at = (msAgo: number, backfillComplete: boolean) => ({
      accountId32: ACCOUNT,
      lastSyncAt: new Date(now.getTime() - msAgo),
      newestStartedAt: null,
      backfillOffset: 0,
      backfillComplete,
      historyRefreshRequestedAt: null,
      rescannedAt: null,
    });
    expect(MatchSyncService.isStale(null, now)).toBe(true);
    expect(MatchSyncService.isStale(at(BACKFILL_COOLDOWN_MS + 1, false), now)).toBe(true);
    expect(MatchSyncService.isStale(at(BACKFILL_COOLDOWN_MS + 1, true), now)).toBe(false);
    expect(MatchSyncService.isStale(at(SYNC_COOLDOWN_MS, true), now)).toBe(true);
  });

  it("asks the upstream to fetch history on first sync and while still empty, at most every 6h", async () => {
    const ctx = setup(0);
    const first = await ctx.service.sync(ACCOUNT);
    expect(first.ok && first.value.historyRefreshRequested).toBe(true);
    expect(ctx.upstream.refreshRequests).toBe(1);

    // Still empty 10 minutes later: throttled.
    ctx.advance(SYNC_COOLDOWN_MS * 2);
    const second = await ctx.service.sync(ACCOUNT);
    expect(second.ok && second.value.historyRefreshRequested).toBe(false);
    expect(ctx.upstream.refreshRequests).toBe(1);

    // Still empty after 6h: ask again.
    ctx.advance(HISTORY_REFRESH_INTERVAL_MS);
    await ctx.service.sync(ACCOUNT);
    expect(ctx.upstream.refreshRequests).toBe(2);
  });

  it("re-requests weekly (not every 6h) once matches exist", async () => {
    const ctx = setup(5);
    await ctx.service.sync(ACCOUNT); // first sync: one request
    ctx.advance(HISTORY_REFRESH_INTERVAL_MS + 1);
    await ctx.service.sync(ACCOUNT);
    expect(ctx.upstream.refreshRequests).toBe(1);
    ctx.advance(PERIODIC_REFRESH_INTERVAL_MS);
    await ctx.service.sync(ACCOUNT);
    expect(ctx.upstream.refreshRequests).toBe(2);
  });

  it("re-walks the whole history once after a refresh, importing older matches the upstream found", async () => {
    // Upstream initially knows 15 recent matches; after a refresh it finds 12 older ones.
    const ctx = setup(15);
    await ctx.service.sync(ACCOUNT); // imports 15, requests a refresh
    expect(ctx.facts.byKey.size).toBe(15);
    for (let i = 0; i < 12; i++) ctx.upstream.history.push(imported(-100 - i)); // older, at the end

    // An incremental sync before the rescan delay finds nothing new.
    ctx.advance(SYNC_COOLDOWN_MS + 1);
    await ctx.service.sync(ACCOUNT);
    expect(ctx.facts.byKey.size).toBe(15);

    // After the delay, the next syncs re-walk from the top and pick up the older matches.
    ctx.advance(RESCAN_DELAY_MS);
    for (let i = 0; i < 4 && ctx.facts.byKey.size < 27; i++) {
      await ctx.service.sync(ACCOUNT);
      ctx.advance(SYNC_COOLDOWN_MS + 1);
    }
    expect(ctx.facts.byKey.size).toBe(27);

    // Only once per refresh: later syncs don't restart the re-walk.
    const callsBefore = ctx.upstream.calls.length;
    await ctx.service.sync(ACCOUNT);
    expect(ctx.upstream.calls.length - callsBefore).toBe(1); // head page only
  });

  it("gives a full backfill to a history that appears after an empty first sync", async () => {
    // Regression: an empty first sync marked history complete, so a later 45-match history
    // stopped after the head pages and never backfilled the rest.
    const ctx = setup(0);
    await ctx.service.sync(ACCOUNT);
    for (let i = 0; i < 45; i++) ctx.upstream.add(imported(i));

    ctx.advance(SYNC_COOLDOWN_MS + 1);
    const next = await ctx.service.sync(ACCOUNT);
    expect(next.ok && next.value).toMatchObject({ fetched: 30, backfillComplete: false });
    ctx.advance(BACKFILL_COOLDOWN_MS + 1);
    const last = await ctx.service.sync(ACCOUNT);
    expect(last.ok && last.value.backfillComplete).toBe(true);
    expect(ctx.facts.byKey.size).toBe(45);
  });

  it("the daily background sync finishes a long history without a visit", async () => {
    const ctx = setup(45);
    await ctx.service.sync(ACCOUNT); // an on-visit sync: 30 of 45, then the player leaves
    ctx.advance(24 * HOUR);
    const res = await ctx.service.syncDue({ limit: 10, budgetMs: 60_000, maxPages: 20 });
    expect(res).toEqual([{ accountId32: ACCOUNT, outcome: "synced", inserted: 15 }]);
    expect(ctx.facts.byKey.size).toBe(45);
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
