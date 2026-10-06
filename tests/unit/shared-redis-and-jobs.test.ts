import { describe, expect, it, vi } from "vitest";
import type { JobRunRepository } from "@/modules/jobs/jobs.ports";
import { JobRunner } from "@/modules/jobs/services/job-runner.service";
import { bucketedKey, isJobName } from "@/modules/jobs/domain/job";
import { InlineJobQueue } from "@/modules/jobs/infrastructure/inline-job-queue";
import { QStashJobQueue } from "@/modules/jobs/infrastructure/qstash-job-queue";
import { ProviderGateway } from "@/common/providers/provider-gateway";
import {
  MAX_SHARED_BODY_BYTES,
  RedisResponseCache,
  RedisUpstreamBudget,
  type RedisLike,
} from "@/common/providers/redis-gateway-store";

vi.mock("server-only", () => ({}));

/** An in-memory stand-in for the Upstash client (expiry ignored unless asked). */
function fakeRedis() {
  const data = new Map<string, string>();
  const counters = new Map<string, number>();
  const redis: RedisLike & { data: typeof data } = {
    data,
    get: vi.fn(async (k: string) => data.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => void data.set(k, v)),
    incr: vi.fn(async (k: string) => {
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      return n;
    }),
    pexpire: vi.fn(async () => 1),
  };
  return redis;
}

describe("RedisResponseCache", () => {
  it("keys by a hash of the URL, so API keys never reach Redis", async () => {
    const redis = fakeRedis();
    const cache = new RedisResponseCache(redis, { prefix: "dd:gw:opendota", now: () => 1_000 });
    const url = "https://api.opendota.com/api/heroStats?api_key=secret-key";
    await cache.set(url, { ok: true, status: 200, body: { a: 1 } }, 60_000);
    const [key] = [...redis.data.keys()];
    expect(key).toMatch(/^dd:gw:opendota:[0-9a-f]{64}$/);
    expect(key).not.toContain("secret-key");
    expect(await cache.get(url)).toEqual({
      value: { ok: true, status: 200, body: { a: 1 } },
      expiresAt: 61_000,
    });
    expect(redis.set).toHaveBeenCalledWith(key, expect.any(String), { px: 60_000 });
  });

  it("doesn't share very large responses", async () => {
    const redis = fakeRedis();
    const cache = new RedisResponseCache(redis, { prefix: "p" });
    const big = "x".repeat(MAX_SHARED_BODY_BYTES);
    await cache.set("https://x/big", { ok: true, status: 200, body: big }, 1_000);
    expect(redis.data.size).toBe(0);
  });
});

describe("RedisUpstreamBudget", () => {
  it("allows calls up to the per-minute limit, then asks to wait for the next minute", async () => {
    const redis = fakeRedis();
    const onExhausted = vi.fn();
    const budget = new RedisUpstreamBudget(redis, {
      prefix: "b",
      perMinute: 2,
      perDay: 100,
      now: () => 90_000, // 30s into a minute
      onExhausted,
    });
    expect(await budget.take()).toEqual({ allowed: true, retryAfterMs: null });
    expect(await budget.take()).toEqual({ allowed: true, retryAfterMs: null });
    expect(await budget.take()).toEqual({ allowed: false, retryAfterMs: 30_000 });
    expect(onExhausted).toHaveBeenCalledWith("minute");
    // Expiry is set once per window, when the counter starts.
    expect(redis.pexpire).toHaveBeenCalledTimes(2);
  });

  it("enforces the daily limit too", async () => {
    const budget = new RedisUpstreamBudget(fakeRedis(), {
      prefix: "b",
      perMinute: 100,
      perDay: 1,
      now: () => 0,
    });
    await budget.take();
    expect(await budget.take()).toMatchObject({ allowed: false });
  });
});

describe("ProviderGateway with a shared cache and budget", () => {
  const ok = () => new Response(JSON.stringify({ a: 1 }), { status: 200 });

  it("serves a hit from the shared cache without calling upstream", async () => {
    const fetch = vi.fn(async () => ok());
    const gw = new ProviderGateway({
      name: "t",
      fetch,
      now: () => 0,
      sharedCache: {
        get: async () => ({
          value: { ok: true, status: 200, body: { cached: true } },
          expiresAt: 10,
        }),
        set: async () => {},
      },
    });
    expect(await gw.getJson("https://x/a", { cacheTtlMs: 10 })).toEqual({
      ok: true,
      status: 200,
      body: { cached: true },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails open when the shared store errors, and reports it", async () => {
    const fetch = vi.fn(async () => ok());
    const onSharedError = vi.fn();
    const gw = new ProviderGateway({
      name: "t",
      fetch,
      now: () => 0,
      sharedCache: {
        get: async () => {
          throw new Error("redis down");
        },
        set: async () => {
          throw new Error("redis down");
        },
      },
      budget: {
        take: async () => {
          throw new Error("redis down");
        },
      },
      onSharedError,
    });
    expect(await gw.getJson("https://x/a", { cacheTtlMs: 10 })).toMatchObject({ ok: true });
    expect(onSharedError.mock.calls.map(([e]) => e.op).sort()).toEqual([
      "budget",
      "cache_get",
      "cache_set",
    ]);
  });

  it("doesn't call upstream when the budget is used up", async () => {
    const fetch = vi.fn(async () => ok());
    const gw = new ProviderGateway({
      name: "t",
      fetch,
      budget: { take: async () => ({ allowed: false, retryAfterMs: 5_000 }) },
    });
    expect(await gw.getJson("https://x/a")).toEqual({
      ok: false,
      kind: "rate_limited",
      status: 429,
      retryAfterMs: 5_000,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("jobs", () => {
  function runs(done: string[] = []) {
    const finished: { runId: string; ok: boolean }[] = [];
    const repo: JobRunRepository = {
      begin: async (_name, dedupKey) =>
        dedupKey && done.includes(dedupKey)
          ? { status: "already_done" }
          : { status: "started", runId: `run-${dedupKey}` },
      finish: async (runId, outcome) => void finished.push({ runId, ok: outcome.ok }),
    };
    return { repo, finished };
  }

  it("runs a job once per dedup key and records failures without throwing", async () => {
    const handler = vi.fn(async () => {});
    const { repo, finished } = runs(["k1"]);
    const runner = new JobRunner({
      handlers: {
        "match-backfill": handler,
        "draft-meta-warm": async () => {
          throw new Error("boom");
        },
      },
      runs: repo,
    });
    expect(await runner.run("match-backfill", {}, "k1")).toEqual({ status: "skipped" });
    expect(handler).not.toHaveBeenCalled();
    expect(await runner.run("match-backfill", { a: 1 }, "k2")).toEqual({ status: "succeeded" });
    expect(await runner.run("draft-meta-warm", {}, "k3")).toEqual({
      status: "failed",
      error: "boom",
    });
    expect(finished).toEqual([
      { runId: "run-k2", ok: true },
      { runId: "run-k3", ok: false },
    ]);
  });

  it("inline queue runs after the response, and skips delayed jobs it can't wait for", async () => {
    const tasks: (() => Promise<void>)[] = [];
    const run = vi.fn(async () => {});
    const queue = new InlineJobQueue({ run, schedule: (t) => void tasks.push(t) });
    expect(queue.durable).toBe(false);
    expect(await queue.enqueue("draft-meta-warm", {}, { dedupKey: "d" })).toBe("inline");
    expect(await queue.enqueue("match-backfill", {}, { delaySec: 30 })).toBe("skipped");
    expect(run).not.toHaveBeenCalled();
    await tasks[0]();
    expect(run).toHaveBeenCalledWith("draft-meta-warm", {}, "d");
    expect(tasks).toHaveLength(1);
  });

  it("QStash queue publishes to the job endpoint with retries, delay, dedup and bypass header", async () => {
    const publishJSON = vi.fn(async () => ({ messageId: "m" }));
    const queue = new QStashJobQueue({ publishJSON } as never, {
      appUrl: "https://dota-den-develop.vercel.app/",
      headers: { "x-vercel-protection-bypass": "b" },
    });
    await queue.enqueue(
      "match-backfill",
      { accountId32: 5 },
      { dedupKey: "backfill:5@1", delaySec: 35 },
    );
    expect(publishJSON).toHaveBeenCalledWith({
      url: "https://dota-den-develop.vercel.app/api/jobs/match-backfill",
      body: { payload: { accountId32: 5 }, dedupKey: "backfill:5@1" },
      retries: 3,
      headers: { "x-vercel-protection-bypass": "b" },
      delay: 35,
      deduplicationId: "match-backfill:backfill:5@1",
    });
  });

  it("buckets dedup keys by time and knows its job names", () => {
    expect(bucketedKey("x", 60_000, 125_000)).toBe("x@2");
    expect(isJobName("match-backfill")).toBe(true);
    expect(isJobName("rm -rf")).toBe(false);
  });
});
