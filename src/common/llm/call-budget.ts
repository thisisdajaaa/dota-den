import "server-only";
import { getRedis } from "@/common/cache/redis";
import { logger } from "@/common/logging/logger";
import { RedisUpstreamBudget, type RedisLike } from "@/common/providers/redis-gateway-store";

/** Reserves one paid model call; false when today's budget is spent. */
export interface CallBudget {
  take(): Promise<boolean>;
}

/** Per-instance counters, for when Redis isn't configured (dev, tests): same shape as Redis. */
class MemoryCounters implements RedisLike {
  private readonly counts = new Map<string, { n: number; expiresAt: number }>();
  async get(): Promise<string | null> {
    return null;
  }
  async set(): Promise<unknown> {
    return null;
  }
  async incr(key: string): Promise<number> {
    const now = Date.now();
    const hit = this.counts.get(key);
    const n = hit && hit.expiresAt > now ? hit.n + 1 : 1;
    this.counts.set(key, {
      n,
      expiresAt: hit && hit.expiresAt > now ? hit.expiresAt : now + 86_400_000,
    });
    if (this.counts.size > 100) {
      for (const [k, v] of this.counts) if (v.expiresAt <= now) this.counts.delete(k);
    }
    return n;
  }
  async pexpire(key: string, ms: number): Promise<unknown> {
    const hit = this.counts.get(key);
    if (hit) hit.expiresAt = Date.now() + ms;
    return 1;
  }
}

const globalForBudget = globalThis as typeof globalThis & { __ddLlmCounters?: MemoryCounters };
let lastErrorLogAt = 0;

/**
 * A daily cap on one feature's model calls, shared by every instance through Redis (per
 * instance without it). Logs `llm_budget_usage` at 50%, 80% and 100% of the cap and
 * `llm_budget_exhausted` for each refused call. If the counter store fails, calls go ahead.
 */
export function dailyCallBudget(name: string, perDay: number): CallBudget {
  const redis = getRedis() as unknown as RedisLike | null;
  const store = redis ?? (globalForBudget.__ddLlmCounters ??= new MemoryCounters());
  const budget = new RedisUpstreamBudget(store, {
    prefix: `dd:budget:llm:${name}`,
    // Only the daily cap matters here; per-client rate limits handle bursts.
    perMinute: Number.MAX_SAFE_INTEGER,
    perDay,
    onMilestone: ({ used, cap }) => logger.info("llm_budget_usage", { budget: name, used, cap }),
    onExhausted: () => logger.warn("llm_budget_exhausted", { budget: name, cap: perDay }),
  });
  return {
    async take() {
      try {
        return (await budget.take()).allowed;
      } catch (error) {
        if (Date.now() - lastErrorLogAt >= 60_000) {
          lastErrorLogAt = Date.now();
          logger.warn("llm_budget_store_unavailable", { budget: name, error });
        }
        return true;
      }
    },
  };
}
