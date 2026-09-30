import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

/**
 * Rate limiting (ADR 0008). With Upstash Redis configured, limits are a sliding window
 * shared by every instance. Without it, or when Redis fails, each instance keeps its own
 * in-memory sliding window (the prototype behaviour).
 */

/** A limiter shared across instances. Rejects (throws) when the store is unreachable. */
export interface SharedRateLimiter {
  limit(key: string, limit: number, windowMs: number): Promise<boolean>;
}

const buckets = new Map<string, number[]>();

/** Per-instance sliding window. Also the fallback when the shared store is unavailable. */
export function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 10_000) buckets.clear(); // bound memory
  return true;
}

/** Minimal slice of `Ratelimit` the adapter uses, so tests can pass a fake. */
export interface WindowLimiter {
  limit(identifier: string): Promise<{ success: boolean; reason?: string }>;
}

/**
 * `@upstash/ratelimit` adapter: one sliding-window limiter per (limit, window) pair.
 * A Redis timeout counts as a failure so the caller falls back to the local limiter.
 */
export class UpstashRateLimiter implements SharedRateLimiter {
  private readonly limiters = new Map<string, WindowLimiter>();

  constructor(private readonly create: (limit: number, windowMs: number) => WindowLimiter) {}

  async limit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const id = `${limit}:${windowMs}`;
    let limiter = this.limiters.get(id);
    if (!limiter) {
      limiter = this.create(limit, windowMs);
      this.limiters.set(id, limiter);
    }
    const res = await limiter.limit(key);
    if (res.reason === "timeout") throw new Error("rate limit store timed out");
    return res.success;
  }
}

/** Shared limiter when it's available; the in-memory limiter otherwise or on error. */
export async function limitWith(
  shared: SharedRateLimiter | null,
  key: string,
  limit: number,
  windowMs: number,
  onError: (e: unknown) => void = () => {},
): Promise<boolean> {
  if (!shared) return memoryRateLimit(key, limit, windowMs);
  try {
    return await shared.limit(key, limit, windowMs);
  } catch (e) {
    onError(e);
    return memoryRateLimit(key, limit, windowMs);
  }
}

const globalForLimiter = globalThis as typeof globalThis & {
  __ddRateLimiter?: SharedRateLimiter | null;
};

function sharedLimiter(): SharedRateLimiter | null {
  if (globalForLimiter.__ddRateLimiter !== undefined) return globalForLimiter.__ddRateLimiter;
  const redis = getRedis();
  globalForLimiter.__ddRateLimiter = redis
    ? new UpstashRateLimiter(
        (limit, windowMs) =>
          new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
            prefix: "dd:rl",
            timeout: 1_000,
          }),
      )
    : null;
  return globalForLimiter.__ddRateLimiter;
}

let lastErrorLogAt = 0;

/**
 * True when the request may proceed. `local: true` keeps a limit per instance even when
 * Redis is configured: used for very frequent polls, which would spend the Redis quota.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  opts: { local?: boolean } = {},
): Promise<boolean> {
  return limitWith(opts.local ? null : sharedLimiter(), key, limit, windowMs, (e) => {
    // Fail open to the local limiter; log at most once a minute per instance.
    if (Date.now() - lastErrorLogAt < 60_000) return;
    lastErrorLogAt = Date.now();
    logger.warn("rate_limit_store_unavailable", { error: e, fallback: "memory" });
  });
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
