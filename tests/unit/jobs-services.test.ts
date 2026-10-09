import { describe, expect, it, vi } from "vitest";
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
      expect(budget).toBeLessThanOrEqual(50_000);
      expect(run.synced).toBe(1);
      expect(finished[0].ok).toBe(true);
      expect(run.notifications).toEqual(expected);
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
});
