import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import type { JobRunRepository } from "@/modules/jobs/jobs.ports";
import { JobRunner } from "@/modules/jobs/services/job-runner.service";
import { bucketedKey, isJobName } from "@/modules/jobs/domain/job";
import { InlineJobQueue } from "@/modules/jobs/infrastructure/inline-job-queue";
import { QStashJobQueue } from "@/modules/jobs/infrastructure/qstash-job-queue";
import { ProviderGateway, type GatewayResponse } from "@/common/providers/provider-gateway";
import {
  COMPRESS_OVER_BYTES,
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

  it("doesn't share responses still too large after compression", async () => {
    const redis = fakeRedis();
    const cache = new RedisResponseCache(redis, { prefix: "p" });
    // Random data barely compresses.
    const big = randomBytes(MAX_SHARED_BODY_BYTES).toString("base64");
    await cache.set("https://x/big", { ok: true, status: 200, body: big }, 1_000);
    expect(redis.data.size).toBe(0);
  });

  it("gzips large responses, so ones over the limit as JSON are still shared", async () => {
    const redis = fakeRedis();
    const cache = new RedisResponseCache(redis, { prefix: "p", now: () => 1_000 });
    // Shaped like OpenDota's ability constants: well over the limit as plain JSON.
    const body = Object.fromEntries(
      Array.from({ length: 8_000 }, (_, i) => [
        `ability_${i}`,
        { dname: `Ability ${i}`, desc: "Deals damage to enemies in an area.", cd: [12, 10, 8] },
      ]),
    );
    const value = { ok: true as const, status: 200, body };
    expect(JSON.stringify({ value, expiresAt: 0 }).length).toBeGreaterThan(MAX_SHARED_BODY_BYTES);
    await cache.set("https://x/abilities", value, 60_000);
    const [stored] = [...redis.data.values()];
    expect(stored.startsWith("gz:")).toBe(true);
    expect(stored.length).toBeLessThanOrEqual(MAX_SHARED_BODY_BYTES);
    expect(await cache.get("https://x/abilities")).toEqual({ value, expiresAt: 61_000 });
  });

  it("keeps small responses as plain JSON and still reads entries written before compression", async () => {
    const redis = fakeRedis();
    const cache = new RedisResponseCache(redis, { prefix: "p", now: () => 1_000 });
    const small = { ok: true as const, status: 200, body: { a: 1 } };
    await cache.set("https://x/small", small, 60_000);
    const [key] = [...redis.data.keys()];
    expect(redis.data.get(key)).toBe(JSON.stringify({ value: small, expiresAt: 61_000 }));

    const big = { ok: true as const, status: 200, body: "y".repeat(COMPRESS_OVER_BYTES * 2) };
    redis.data.set(key, JSON.stringify({ value: big, expiresAt: 5_000 }));
    expect(await cache.get("https://x/small")).toEqual({ value: big, expiresAt: 5_000 });
  });

  it("fails on a corrupt compressed entry (the gateway treats that as a miss)", async () => {
    const redis = fakeRedis();
    const cache = new RedisResponseCache(redis, { prefix: "p" });
    await cache.set(
      "https://x/a",
      { ok: true, status: 200, body: "z".repeat(COMPRESS_OVER_BYTES * 2) },
      1_000,
    );
    const [key] = [...redis.data.keys()];
    redis.data.set(key, "gz:not-gzip");
    await expect(cache.get("https://x/a")).rejects.toThrow();
    // A real gzip of something that isn't an entry is also refused rather than trusted.
    redis.data.set(key, `gz:${gzipSync("null").toString("base64")}`);
    expect(await cache.get("https://x/a")).toBeNull();
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

  it("reports each daily milestone once, for the guest share and the whole day", async () => {
    const onMilestone = vi.fn();
    const budget = new RedisUpstreamBudget(fakeRedis(), {
      prefix: "b",
      perMinute: 1_000,
      perDay: 20,
      now: () => 0,
      lane: async () => "guest",
      guestShare: 0.5, // a guest cap of 10
      onMilestone,
    });
    for (let i = 0; i < 12; i++) await budget.take();
    expect(onMilestone.mock.calls.map(([e]) => e)).toEqual([
      { window: "guest_day", used: 5, cap: 10 },
      { window: "guest_day", used: 8, cap: 10 },
      // The guest share is counted first; refused guest calls never reach the day count.
      { window: "guest_day", used: 10, cap: 10 },
      { window: "day", used: 10, cap: 20 },
    ]);
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

  it("caps signed-out visitors at their share, leaving the rest for signed-in players", async () => {
    let lane: "guest" | "member" = "guest";
    const onExhausted = vi.fn();
    const budget = new RedisUpstreamBudget(fakeRedis(), {
      prefix: "b",
      perMinute: 1_000,
      perDay: 10,
      guestShare: 0.4,
      lane: async () => lane,
      now: () => 0,
      onExhausted,
    });
    for (let i = 0; i < 4; i++) expect((await budget.take()).allowed).toBe(true);
    // Guests have used their 4 of 10; more guest calls are refused...
    for (let i = 0; i < 5; i++) expect((await budget.take()).allowed).toBe(false);
    expect(onExhausted).toHaveBeenCalledWith("guest_day");
    // ...without eating into the shared budget: members still get the other 6.
    lane = "member";
    for (let i = 0; i < 6; i++) expect((await budget.take()).allowed).toBe(true);
    expect((await budget.take()).allowed).toBe(false);
  });

  it("treats a failing lane check as a member call", async () => {
    const budget = new RedisUpstreamBudget(fakeRedis(), {
      prefix: "b",
      perMinute: 100,
      perDay: 10,
      guestShare: 0,
      lane: async () => Promise.reject(new Error("no request")),
      now: () => 0,
    });
    expect((await budget.take()).allowed).toBe(true);
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

  it("keeps shared answers past expiry and serves them when the upstream fails", async () => {
    let t = 0;
    const store = new Map<string, unknown>();
    const set = vi.fn(
      async (k: string, v: unknown, _ttlMs: number, _retainMs?: number) => void store.set(k, v),
    );
    const sharedCache = {
      get: async (k: string) =>
        (store.get(k) as { value: GatewayResponse; expiresAt: number } | undefined) ?? null,
      set: async (k: string, value: GatewayResponse, ttlMs: number, retainMs?: number) => {
        await set(k, { value, expiresAt: t + ttlMs }, ttlMs, retainMs);
      },
    };
    const writer = new ProviderGateway({
      name: "t",
      fetch: async () => ok(),
      now: () => t,
      sharedCache,
    });
    await writer.getJson("https://x/a", { cacheTtlMs: 1_000 });
    expect(set.mock.calls[0].slice(2)).toEqual([1_000, 2_000]);
    // Another instance, after expiry, with the upstream down.
    t = 1_500;
    const reader = new ProviderGateway({
      name: "t",
      fetch: async () => new Response("{}", { status: 503 }),
      now: () => t,
      maxRetries: 0,
      sharedCache,
    });
    expect(await reader.getJson("https://x/a", { cacheTtlMs: 1_000 })).toMatchObject({
      ok: true,
      body: { a: 1 },
    });
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
        "meta-warm": handler,
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
