import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));

const { limitWith, memoryRateLimit, rateLimit, UpstashRateLimiter } =
  await import("@/lib/rate-limit");

describe("rate limiting", () => {
  it("uses the per-instance window without Redis", async () => {
    const key = `k-${Math.random()}`;
    expect(await rateLimit(key, 2, 60_000)).toBe(true);
    expect(await rateLimit(key, 2, 60_000)).toBe(true);
    expect(await rateLimit(key, 2, 60_000)).toBe(false);
  });

  it("uses the shared limiter when present", async () => {
    const shared = { limit: vi.fn(async () => false) };
    expect(await limitWith(shared, "k", 5, 1_000)).toBe(false);
    expect(shared.limit).toHaveBeenCalledWith("k", 5, 1_000);
  });

  it("falls back to the local window when the shared store fails", async () => {
    const onError = vi.fn();
    const shared = {
      limit: vi.fn(async () => {
        throw new Error("redis down");
      }),
    };
    const key = `f-${Math.random()}`;
    expect(await limitWith(shared, key, 1, 60_000, onError)).toBe(true);
    expect(await limitWith(shared, key, 1, 60_000, onError)).toBe(false);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("treats an Upstash timeout as a failure (so the local window decides)", async () => {
    const limiter = new UpstashRateLimiter(() => ({
      limit: async () => ({ success: true, reason: "timeout" }),
    }));
    await expect(limiter.limit("k", 1, 1_000)).rejects.toThrow(/timed out/);
    expect(memoryRateLimit(`m-${Math.random()}`, 1, 1_000)).toBe(true);
  });
});
