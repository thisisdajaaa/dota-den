import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "@/common/errors/app-error";
import type { JobQueue, MatchSyncPort } from "@/modules/jobs/jobs.ports";
import { CronService } from "@/modules/jobs/services/cron.service";
import { JobsService, MAX_BACKFILL_CHUNKS } from "@/modules/jobs/services/jobs.service";

const queue = (durable = true) => {
  const enqueue = vi.fn(async (..._args: unknown[]) => "queued" as const);
  return { q: { durable, enqueue } satisfies JobQueue, enqueue };
};
const logger = { info: () => {}, warn: () => {} };

describe("JobsService backfill", () => {
  const make = (sync: MatchSyncPort["sync"], durable = true) => {
    const { q, enqueue } = queue(durable);
    const svc = new JobsService({
      queue: () => q,
      matches: { sync, syncDue: async () => [] },
      backfillCooldownMs: 120_000,
      warmDraftData: async () => [],
      warmMeta: async () => [],
      logger,
      now: () => 0,
    });
    return { svc, enqueue };
  };

  it("chains the next chunk while history remains, and stops when complete", async () => {
    const more = make(async () => ({ ok: true, value: { backfillComplete: false } }));
    await more.svc.backfillChunk({ accountId32: 7, chunk: 2 });
    expect(more.enqueue).toHaveBeenCalledWith(
      "match-backfill",
      { accountId32: 7, chunk: 3 },
      expect.objectContaining({ delaySec: 120 }),
    );
    const done = make(async () => ({ ok: true, value: { backfillComplete: true } }));
    await done.svc.backfillChunk({ accountId32: 7, chunk: 2 });
    expect(done.enqueue).not.toHaveBeenCalled();
    const capped = make(async () => ({ ok: true, value: { backfillComplete: false } }));
    await capped.svc.backfillChunk({ accountId32: 7, chunk: MAX_BACKFILL_CHUNKS });
    expect(capped.enqueue).not.toHaveBeenCalled();
  });

  it("waits out a cooldown and fails on upstream trouble so the queue retries", async () => {
    const cool = make(async () => ({
      ok: false,
      error: { type: "cooldown", retryAt: new Date(300_000) },
    }));
    await cool.svc.backfillChunk({ accountId32: 7 });
    expect(cool.enqueue.mock.calls[0][2]).toMatchObject({ delaySec: 300 });
    const down = make(async () => ({ ok: false, error: { type: "unavailable" } }));
    await expect(down.svc.backfillChunk({ accountId32: 7 })).rejects.toThrow("unavailable");
  });

  it("uses the account's own cooldown (Plus priority sync) for the wait and the dedup bucket", async () => {
    const { q, enqueue } = queue();
    const svc = new JobsService({
      queue: () => q,
      matches: {
        sync: async () => ({ ok: true, value: { backfillComplete: false } }),
        syncDue: async () => [],
      },
      backfillCooldownMs: 30_000,
      cooldownFor: async (id) => (id === 7 ? 10_000 : 30_000),
      warmDraftData: async () => [],
      warmMeta: async () => [],
      logger,
      now: () => 1_000_000,
    });
    await svc.backfillChunk({ accountId32: 7, chunk: 0 });
    expect(enqueue.mock.calls[0][2]).toEqual({
      delaySec: 10,
      dedupKey: `backfill:7@${Math.floor(1_010_000 / 10_000)}`,
    });
    await svc.backfillChunk({ accountId32: 8, chunk: 0 });
    expect(enqueue.mock.calls[1][2]).toMatchObject({ delaySec: 30 });
    // A failed lookup falls back to the free cooldown.
    const fallback = new JobsService({
      queue: () => q,
      matches: {
        sync: async () => ({ ok: true, value: { backfillComplete: false } }),
        syncDue: async () => [],
      },
      backfillCooldownMs: 30_000,
      cooldownFor: async () => {
        throw new Error("down");
      },
      warmDraftData: async () => [],
      warmMeta: async () => [],
      logger,
      now: () => 0,
    });
    await fallback.enqueueMatchBackfill(9);
    expect(enqueue.mock.calls[2][2]).toMatchObject({ delaySec: 30 });
  });

  it("only queues backfill on a durable queue", async () => {
    const inline = make(async () => ({ ok: true, value: { backfillComplete: false } }), false);
    await inline.svc.enqueueMatchBackfill(7);
    expect(inline.enqueue).not.toHaveBeenCalled();
  });
});

describe("CronService", () => {
  const runs = () => {
    const finished: Array<{ ok: boolean; summary: Record<string, unknown> }> = [];
    return {
      finished,
      repo: {
        start: async () => "run1",
        finish: async (_: string, r: (typeof finished)[number]) => void finished.push(r),
      },
    };
  };

  it("syncs matches, records medals and the run", async () => {
    const { finished, repo } = runs();
    const record = vi.fn(async () => {});
    const svc = new CronService({
      runs: repo,
      matches: {
        sync: async () => ({ ok: true, value: { backfillComplete: true } }),
        syncDue: async () => [
          { accountId32: 1, outcome: "synced" },
          { accountId32: 2, outcome: "skipped_time" },
          { accountId32: 3, outcome: "unavailable" },
        ],
      },
      medals: { currentRankTier: async () => ({ rankTier: 55 }), record },
      patches: { importLatest: async () => ({ ok: true, value: [] }) },
      caches: { warmDraftData: async () => [], warmMeta: async () => [] },
      queue: () => queue().q,
      logger,
    });
    const run = await svc.runMatchSync("admin");
    expect(run).toMatchObject({ accounts: 3, synced: 1, skipped: 1, medals: 2 });
    expect(run.failed).toEqual([{ accountId32: 3, outcome: "unavailable" }]);
    expect(record).toHaveBeenCalledTimes(2);
    expect(finished[0].ok).toBe(true);
  });

  it("fills a few match extras for the accounts it reached, within a small budget", async () => {
    const { repo } = runs();
    const summary = { accounts: 2, fetched: 4, parsed: 3, stoppedEarly: false };
    const backfillMany = vi.fn(async () => summary);
    const svc = new CronService({
      runs: repo,
      matches: {
        sync: async () => ({ ok: true, value: { backfillComplete: true } }),
        syncDue: async () => [
          { accountId32: 1, outcome: "synced" },
          { accountId32: 2, outcome: "skipped_time" },
          { accountId32: 3, outcome: "cooldown" },
        ],
      },
      medals: { currentRankTier: async () => null, record: async () => {} },
      extras: { backfillMany },
      patches: { importLatest: async () => ({ ok: true, value: [] }) },
      caches: { warmDraftData: async () => [], warmMeta: async () => [] },
      queue: () => queue().q,
      logger,
    });
    const run = await svc.runMatchSync("cron");
    expect(run.extras).toEqual(summary);
    const [ids, opts] = backfillMany.mock.calls[0] as unknown as [number[], { budgetMs: number }];
    expect(ids).toEqual([1, 3]);
    expect(opts.budgetMs).toBeLessThanOrEqual(8_000);
  });

  it("sends the morning notifications after the sync, and survives them failing", async () => {
    const summary = {
      users: 2,
      sessionRecaps: 1,
      weeklyRecaps: 0,
      patchHeroes: 0,
      failed: 0,
      stoppedEarly: false,
    };
    const cases = [
      { runDaily: vi.fn(async () => summary), expected: summary },
      { runDaily: vi.fn(async () => Promise.reject(new Error("x"))), expected: null },
    ];
    for (const { runDaily, expected } of cases) {
      const { finished, repo } = runs();
      const svc = new CronService({
        runs: repo,
        matches: {
          sync: async () => ({ ok: true, value: { backfillComplete: true } }),
          syncDue: async () => [{ accountId32: 1, outcome: "synced" }],
        },
        medals: { currentRankTier: async () => null, record: async () => {} },
        notifications: { runDaily },
        patches: { importLatest: async () => ({ ok: true, value: [] }) },
        caches: { warmDraftData: async () => [], warmMeta: async () => [] },
        queue: () => queue().q,
        logger,
      });
      const run = await svc.runMatchSync("cron");
      const budget = (runDaily.mock.calls[0] as unknown as [{ budgetMs: number }])[0].budgetMs;
      expect(budget).toBeGreaterThan(40_000);
      expect(budget).toBeLessThanOrEqual(46_000);
      expect(run.synced).toBe(1);
      expect(finished[0].ok).toBe(true);
      expect(run.notifications).toEqual(expected);
    }
  });

  it("posts Discord feeds after the sync, before notifications, and survives them failing", async () => {
    const summary = { feeds: 1, posted: 2, failed: 0, rateLimited: false, stoppedEarly: false };
    const cases = [
      { runAll: vi.fn(async () => summary), expected: summary },
      { runAll: vi.fn(async () => Promise.reject(new Error("x"))), expected: null },
    ];
    for (const { runAll, expected } of cases) {
      const order: string[] = [];
      const budgets: number[] = [];
      const { repo } = runs();
      const svc = new CronService({
        runs: repo,
        matches: {
          sync: async () => ({ ok: true, value: { backfillComplete: true } }),
          syncDue: async () => [{ accountId32: 1, outcome: "synced" }],
        },
        medals: { currentRankTier: async () => null, record: async () => {} },
        discord: {
          runAll: (opts) => {
            order.push("discord");
            budgets.push(opts.budgetMs);
            return runAll();
          },
        },
        notifications: {
          runDaily: async () => {
            order.push("notifications");
            return {
              users: 0,
              sessionRecaps: 0,
              weeklyRecaps: 0,
              patchHeroes: 0,
              failed: 0,
              stoppedEarly: false,
            };
          },
        },
        patches: { importLatest: async () => ({ ok: true, value: [] }) },
        caches: { warmDraftData: async () => [], warmMeta: async () => [] },
        queue: () => queue().q,
        logger,
      });
      const run = await svc.runMatchSync("cron");
      expect(order).toEqual(["discord", "notifications"]);
      expect(runAll).toHaveBeenCalledTimes(1);
      // Capped, so the notifications still get their time.
      expect(budgets[0]).toBeLessThanOrEqual(15_000);
      expect(budgets[0]).toBeGreaterThanOrEqual(2_000);
      expect(run.discord).toEqual(expected);
    }
  });

  it("sends the weekly emails after the notifications, and survives them failing", async () => {
    const summary = { users: 3, sent: 2, skipped: 1, failed: 0, stoppedEarly: false };
    const cases = [
      { runDaily: vi.fn(async () => summary), expected: summary },
      { runDaily: vi.fn(async () => Promise.reject(new Error("x"))), expected: null },
    ];
    for (const { runDaily, expected } of cases) {
      const { finished, repo } = runs();
      const svc = new CronService({
        runs: repo,
        matches: {
          sync: async () => ({ ok: true, value: { backfillComplete: true } }),
          syncDue: async () => [{ accountId32: 1, outcome: "synced" }],
        },
        medals: { currentRankTier: async () => null, record: async () => {} },
        weeklyEmail: { runDaily },
        patches: { importLatest: async () => ({ ok: true, value: [] }) },
        caches: { warmDraftData: async () => [], warmMeta: async () => [] },
        queue: () => queue().q,
        logger,
      });
      const run = await svc.runMatchSync("cron");
      const budget = (runDaily.mock.calls[0] as unknown as [{ budgetMs: number }])[0].budgetMs;
      expect(budget).toBeGreaterThan(40_000);
      expect(finished[0].ok).toBe(true);
      expect(run.digests).toEqual(expected);
      expect(run.notifications).toBeNull();
    }
  });

  it("records a failed patch refresh and reports the feed as unavailable", async () => {
    const { finished, repo } = runs();
    const svc = new CronService({
      runs: repo,
      matches: {
        sync: async () => ({ ok: true, value: { backfillComplete: true } }),
        syncDue: async () => [],
      },
      medals: { currentRankTier: async () => null, record: async () => {} },
      patches: {
        importLatest: async () => ({ ok: false, error: { error: { type: "unavailable" } } }),
      },
      caches: { warmDraftData: async () => [], warmMeta: async () => [{ key: "duos", ok: true }] },
      queue: () => queue(false).q,
      logger,
    });
    await expect(svc.runPatchRefresh("cron", "req1")).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
    expect(finished[0]).toMatchObject({ ok: false, summary: { error: "unavailable" } });
  });

  describe("time budgets", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const never = <T>() => new Promise<T>(() => {});
    const patchCron = (over: {
      importLatest?: () => Promise<{ ok: true; value: Array<{ outcome: string }> }>;
      warmDraftData?: () => Promise<Array<{ key: string; ok: boolean }>>;
      warmMeta?: () => Promise<Array<{ key: string; ok: boolean }>>;
      durable?: boolean;
    }) => {
      const { finished, repo } = runs();
      const { q, enqueue } = queue(over.durable ?? false);
      const warmMeta = vi.fn(over.warmMeta ?? (async () => [{ key: "duos", ok: true }]));
      const svc = new CronService({
        runs: repo,
        matches: {
          sync: async () => ({ ok: true, value: { backfillComplete: true } }),
          syncDue: async () => [],
        },
        medals: { currentRankTier: async () => null, record: async () => {} },
        patches: { importLatest: over.importLatest ?? (async () => ({ ok: true, value: [] })) },
        caches: { warmDraftData: over.warmDraftData ?? (async () => []), warmMeta },
        queue: () => q,
        logger,
      });
      return { svc, finished, enqueue, warmMeta };
    };

    it("records a patch import that runs out of time instead of being cut off", async () => {
      const { svc, finished, warmMeta } = patchCron({ importLatest: never });
      const run = svc.runPatchRefresh("cron", "req1");
      const failure = expect(run).rejects.toBeInstanceOf(UpstreamUnavailableError);
      await vi.advanceTimersByTimeAsync(46_000);
      await failure;
      expect(finished[0]).toMatchObject({
        ok: false,
        summary: { error: "timed_out", meta: "skipped_time" },
      });
      expect(warmMeta).not.toHaveBeenCalled();
    });

    it("stops waiting for slow draft data in time for the Meta queries", async () => {
      const { svc, finished, warmMeta } = patchCron({
        importLatest: async () => ({ ok: true, value: [{ outcome: "unchanged" }] }),
        warmDraftData: never,
      });
      const run = svc.runPatchRefresh("cron", "req1");
      await vi.advanceTimersByTimeAsync(31_000);
      await expect(run).resolves.toEqual({ outcomes: [{ outcome: "unchanged" }] });
      expect(warmMeta).toHaveBeenCalledOnce();
      expect(finished[0]).toMatchObject({
        ok: true,
        summary: { tournaments: "timed_out", meta: [{ key: "duos", ok: true }] },
      });
    });

    it("caps the Meta queries at the time left", async () => {
      const { svc, finished } = patchCron({ warmMeta: never });
      const run = svc.runPatchRefresh("cron", "req1");
      await vi.advanceTimersByTimeAsync(46_000);
      await run;
      expect(finished[0]).toMatchObject({ ok: true, summary: { meta: "timed_out" } });
    });

    it("queues both tournament refreshes when the queue is durable", async () => {
      const { svc, enqueue, warmMeta, finished } = patchCron({ durable: true });
      await svc.runPatchRefresh("cron", "req1");
      expect(enqueue.mock.calls.map((c) => c[0])).toEqual(["draft-meta-warm", "meta-warm"]);
      expect(warmMeta).not.toHaveBeenCalled();
      expect(finished[0]).toMatchObject({ ok: true, summary: { meta: "queued" } });
    });

    it("records the run as finished when the import throws", async () => {
      const { svc, finished } = patchCron({
        importLatest: async () => {
          throw new Error("db down");
        },
      });
      await expect(svc.runPatchRefresh("cron", "req1")).rejects.toThrow("db down");
      expect(finished[0]).toMatchObject({ ok: false, summary: { error: "db down" } });
    });

    it("doesn't let a slow medal lookup near the end overrun the run", async () => {
      const { finished, repo } = runs();
      const lookups: number[] = [];
      const svc = new CronService({
        runs: repo,
        matches: {
          sync: async () => ({ ok: true, value: { backfillComplete: true } }),
          syncDue: async () => [
            { accountId32: 1, outcome: "synced" },
            { accountId32: 2, outcome: "synced" },
            { accountId32: 3, outcome: "synced" },
          ],
        },
        medals: {
          // The first lookup takes 40s and the second hangs: it gets the 6s left, no more.
          currentRankTier: (id) => {
            lookups.push(id);
            return id === 1
              ? new Promise((r) => setTimeout(() => r({ rankTier: 55 }), 40_000))
              : never();
          },
          record: async () => {},
        },
        patches: { importLatest: async () => ({ ok: true, value: [] }) },
        caches: { warmDraftData: async () => [], warmMeta: async () => [] },
        queue: () => queue().q,
        logger,
      });
      vi.setSystemTime(0);
      const run = svc.runMatchSync("cron");
      await vi.advanceTimersByTimeAsync(46_000);
      await expect(run).resolves.toMatchObject({ medals: 1, durationMs: 46_000 });
      expect(lookups).toEqual([1, 2]);
      expect(finished[0].ok).toBe(true);
    });
  });
});
