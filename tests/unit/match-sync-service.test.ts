import { describe, expect, it } from "vitest";
import type {
  ImportedPlayerMatch,
  LockOutcome,
  MatchProvider,
  MatchFactsPort,
  ProviderCallOptions,
  SyncState,
  SyncStatesPort,
} from "@/modules/matches/matches.ports";
import {
  BACKFILL_COOLDOWN_MS,
  HISTORY_PAGE_CALL,
  HISTORY_REFRESH_INTERVAL_MS,
  MatchSyncService,
  PERIODIC_REFRESH_INTERVAL_MS,
  RESCAN_DELAY_MS,
  SYNC_COOLDOWN_MS,
  toFact,
} from "@/modules/matches/services/match-sync.service";
import type { PlayerMatchFact } from "@/modules/matches/domain/player-match-fact";
import { err, ok } from "@/common/result";

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
    allyHeroIds: [2, 3, 4, 5],
    enemyHeroIds: [6, 7, 8, 9, 10],
    provenance: { provider: "opendota", fetchedAt: new Date(), parseStatus: "unparsed" },
    ...overrides,
  };
}

/** Upstream history, newest first, like OpenDota. */
class FakeUpstream implements MatchProvider {
  calls: Array<{ offset: number; limit: number }> = [];
  callOptions: Array<ProviderCallOptions | undefined> = [];
  refreshRequests = 0;
  failOnCall: number | null = null;
  constructor(public history: ImportedPlayerMatch[]) {}
  add(m: ImportedPlayerMatch) {
    this.history.unshift(m);
  }
  async fetchPlayerMatches(
    _id: number,
    page: { offset: number; limit: number },
    call?: ProviderCallOptions,
  ) {
    this.calls.push(page);
    this.callOptions.push(call);
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

class MemoryFacts implements MatchFactsPort {
  byKey = new Map<string, PlayerMatchFact>();
  /** Keys of facts stored before lineups were kept (schema version 1). */
  withoutLineups = new Set<string>();
  /** Store facts as an older version would have (no lineups). */
  seedLegacy(facts: readonly PlayerMatchFact[]) {
    for (const f of facts) {
      const key = `${f.accountId32}:${f.matchId}`;
      this.byKey.set(key, { ...f, allyHeroIds: null, enemyHeroIds: null });
      this.withoutLineups.add(key);
    }
  }
  async countWithoutLineups(accountId32: number) {
    return [...this.withoutLineups].filter((k) => k.startsWith(`${accountId32}:`)).length;
  }
  async upsertMany(facts: readonly PlayerMatchFact[]) {
    let inserted = 0;
    let updated = 0;
    for (const f of facts) {
      const key = `${f.accountId32}:${f.matchId}`;
      this.withoutLineups.delete(key);
      if (this.byKey.has(key)) updated++;
      else inserted++;
      this.byKey.set(key, f);
    }
    return { inserted, updated };
  }
}

class MemorySyncState implements SyncStatesPort {
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
      lineupBackfillOffset: 0,
      lineupBackfillComplete: false,
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

function setup(
  historySize: number,
  opts: { pageSize?: number; historyPageSize?: number; maxPages?: number } = {},
) {
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
    historyPageSize: opts.historyPageSize,
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
        lineupsComplete: true,
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
      lineupBackfillOffset: 0,
      lineupBackfillComplete: true,
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

  it("keeps what it imported when an older-history page fails", async () => {
    const ctx = setup(60, { maxPages: 2 });
    await ctx.service.sync(ACCOUNT); // first sync: 20 of 60
    ctx.advance(BACKFILL_COOLDOWN_MS + 1);
    // Second sync: head page, two older pages, then an older page fails.
    ctx.upstream.failOnCall = ctx.upstream.calls.length + 4;
    const res = await ctx.service.sync(ACCOUNT, { maxPages: 6 });
    expect(res.ok && res.value.backfillComplete).toBe(false);
    expect(ctx.facts.byKey.size).toBe(40);
    expect((await ctx.syncState.get())?.backfillOffset).toBe(40);
  });

  it("stops importing older history at the deadline, after new matches", async () => {
    const ctx = setup(60, { maxPages: 2 });
    await ctx.service.sync(ACCOUNT);
    ctx.advance(BACKFILL_COOLDOWN_MS + 1);
    const before = ctx.upstream.calls.length;
    const res = await ctx.service.sync(ACCOUNT, { maxPages: 6, deadline: 0 }); // already past
    expect(res.ok).toBe(true);
    expect(ctx.upstream.calls.length - before).toBe(1); // the head page only
  });

  it("lets a first import stop at the deadline and carry on next time", async () => {
    const ctx = setup(45, { maxPages: 5 });
    const first = await ctx.service.sync(ACCOUNT, { deadline: 0 }); // already past
    expect(first.ok && first.value).toMatchObject({ fetched: 10, backfillComplete: false });
    expect(ctx.upstream.calls).toHaveLength(1);
    expect((await ctx.syncState.get())?.backfillOffset).toBe(10);
    // Next run continues from there and finishes the history.
    ctx.advance(BACKFILL_COOLDOWN_MS + 1);
    const second = await ctx.service.sync(ACCOUNT);
    expect(second.ok && second.value.backfillComplete).toBe(true);
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
    ctx.upstream.failOnCall = 1;
    expect(await ctx.service.sync(ACCOUNT)).toMatchObject({
      ok: false,
      error: { type: "provider" },
    });
    expect(ctx.syncState.state).toMatchObject({ lockedUntil: null, lastSyncAt: null });
    // Immediately retryable.
    ctx.upstream.failOnCall = null;
    expect((await ctx.service.sync(ACCOUNT)).ok).toBe(true);
  });

  it("keeps a first import's pages when a later page fails, and carries on next time", async () => {
    const ctx = setup(25);
    ctx.upstream.failOnCall = 2;
    const first = await ctx.service.sync(ACCOUNT);
    expect(first.ok && first.value).toMatchObject({ fetched: 10, backfillComplete: false });
    // No more calls to a failing upstream in this sync (not even the history refresh).
    expect(ctx.upstream.calls).toHaveLength(2);
    expect(ctx.upstream.refreshRequests).toBe(0);
    expect((await ctx.syncState.get())?.backfillOffset).toBe(10);

    ctx.upstream.failOnCall = null;
    ctx.advance(BACKFILL_COOLDOWN_MS + 1);
    const second = await ctx.service.sync(ACCOUNT);
    expect(second.ok && second.value.backfillComplete).toBe(true);
    expect(ctx.facts.byKey.size).toBe(25);
  });

  it("still fails a known history when a new-matches page fails, so no gap is recorded", async () => {
    const ctx = setup(25, { maxPages: 2 });
    await ctx.service.sync(ACCOUNT);
    const newest = (await ctx.syncState.get())?.newestStartedAt;
    for (let i = 100; i < 115; i++) ctx.upstream.add(imported(i));
    ctx.advance(SYNC_COOLDOWN_MS + 1);
    ctx.upstream.failOnCall = ctx.upstream.calls.length + 2; // the second new-matches page
    expect(await ctx.service.sync(ACCOUNT)).toMatchObject({
      ok: false,
      error: { type: "provider" },
    });
    expect((await ctx.syncState.get())?.newestStartedAt).toEqual(newest);
  });

  it("walks history in big pages and new matches in small ones, with slow-call limits", async () => {
    const ctx = setup(1_200, { pageSize: 100, historyPageSize: 500 });
    const first = await ctx.service.sync(ACCOUNT);
    expect(first.ok && first.value).toMatchObject({ fetched: 1_200, backfillComplete: true });
    expect(ctx.upstream.calls.map((c) => c.limit)).toEqual([500, 500, 500]);

    for (let i = 2_000; i < 2_003; i++) ctx.upstream.add(imported(i));
    ctx.advance(SYNC_COOLDOWN_MS + 1);
    const before = ctx.upstream.calls.length;
    const res = await ctx.service.sync(ACCOUNT);
    expect(res.ok && res.value.inserted).toBe(3);
    expect(ctx.upstream.calls.slice(before).map((c) => c.limit)).toEqual([100]);
    expect(ctx.upstream.callOptions.every((o) => o === HISTORY_PAGE_CALL)).toBe(true);
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
  describe("lineup backfill", () => {
    /** An account whose history was imported before lineups were kept. */
    function legacy(historySize: number, opts: { maxPages?: number } = {}) {
      const ctx = setup(historySize, { maxPages: opts.maxPages ?? 3 });
      ctx.facts.seedLegacy(ctx.upstream.history.map((m) => toFact(m, [])));
      ctx.syncState.state = {
        accountId32: ACCOUNT,
        lastSyncAt: new Date("2026-09-28T12:00:00Z"),
        newestStartedAt: ctx.upstream.history[0].startedAt,
        backfillOffset: historySize,
        backfillComplete: true,
        historyRefreshRequestedAt: new Date("2026-09-28T12:00:00Z"),
        rescannedAt: new Date("2026-09-28T12:00:00Z"),
        lineupBackfillOffset: 0,
        lineupBackfillComplete: false,
        lockedUntil: null,
      };
      return ctx;
    }

    it("is done at once for a history imported with lineups (no extra calls)", async () => {
      const ctx = setup(7);
      const res = await ctx.service.sync(ACCOUNT);
      expect(res.ok && res.value.lineupsComplete).toBe(true);
      expect(ctx.upstream.calls).toHaveLength(1);
      expect(ctx.syncState.state).toMatchObject({ lineupBackfillComplete: true });
    });

    it("re-reads older games' lineups from the paged history with the leftover budget", async () => {
      const ctx = legacy(25);
      const res = await ctx.service.sync(ACCOUNT);
      expect(res.ok && res.value.lineupsComplete).toBe(true);
      // The head page, then the rest of the history: never one call per match.
      expect(ctx.upstream.calls.map((c) => c.offset)).toEqual([0, 10, 20]);
      expect(await ctx.facts.countWithoutLineups(ACCOUNT)).toBe(0);
      expect([...ctx.facts.byKey.values()].every((f) => f.enemyHeroIds?.length === 5)).toBe(true);
    });

    it("resumes where it stopped, shifted by new matches, until the history runs out", async () => {
      const ctx = legacy(45, { maxPages: 2 });
      const first = await ctx.service.sync(ACCOUNT);
      expect(first.ok && first.value.lineupsComplete).toBe(false);
      expect(ctx.syncState.state).toMatchObject({ lineupBackfillOffset: 20 });
      expect(await ctx.facts.countWithoutLineups(ACCOUNT)).toBe(25);

      // Three new games push the older ones down by three.
      for (let i = 100; i < 103; i++) ctx.upstream.add(imported(i));
      ctx.advance(SYNC_COOLDOWN_MS + 1);
      ctx.upstream.calls = [];
      await ctx.service.sync(ACCOUNT);
      expect(ctx.upstream.calls.map((c) => c.offset)).toEqual([0, 23]);

      for (let i = 0; i < 3; i++) {
        ctx.advance(SYNC_COOLDOWN_MS + 1);
        await ctx.service.sync(ACCOUNT);
      }
      expect(await ctx.facts.countWithoutLineups(ACCOUNT)).toBe(0);
      expect(ctx.syncState.state).toMatchObject({ lineupBackfillComplete: true });
    });

    it("finishes when the history runs out, leaving games the upstream no longer lists", async () => {
      const ctx = legacy(15);
      // A stored game the upstream doesn't return any more.
      ctx.facts.seedLegacy([toFact(imported(-5, { matchId: "999" }), [])]);
      const res = await ctx.service.sync(ACCOUNT);
      expect(res.ok && res.value.lineupsComplete).toBe(true);
      expect(await ctx.facts.countWithoutLineups(ACCOUNT)).toBe(1);
      expect(ctx.facts.byKey.get(`${ACCOUNT}:999`)?.enemyHeroIds).toBeNull();
    });

    it("keeps the sync's result and resumes later when a lineup page fails", async () => {
      const ctx = legacy(45, { maxPages: 5 });
      ctx.upstream.failOnCall = 2;
      const res = await ctx.service.sync(ACCOUNT);
      expect(res.ok && res.value.lineupsComplete).toBe(false);
      expect(ctx.syncState.state).toMatchObject({ lineupBackfillOffset: 10, lockedUntil: null });
    });
  });
});
