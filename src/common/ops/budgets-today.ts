import "server-only";
import { getRedis } from "@/common/cache/redis";
import { env, openDotaBudget } from "@/common/config/env";
import { GUEST_AI_SHARE } from "@/common/llm/call-budget";
import { DEFAULT_GUEST_SHARE } from "@/common/providers/redis-gateway-store";
import { STRATZ_BUDGET } from "@/common/providers/shared-gateway-options";

const DAY_MS = 86_400_000;

export const BUDGET_KEYS = ["opendota", "opendotaGuest", "stratz", "ai", "aiGuest"] as const;
export type BudgetKey = (typeof BUDGET_KEYS)[number];

export interface BudgetToday {
  key: BudgetKey;
  used: number;
  cap: number;
}

/**
 * Today's (UTC day's) use of every daily budget, read from the counters the budgets keep in
 * Redis. `redis` is "off" without Redis (counters are per server then) and "error" when the
 * read failed, which is itself worth seeing: it's how a spent Upstash plan shows up.
 */
export async function budgetsToday(
  now = Date.now(),
): Promise<{ redis: "ok" | "off" | "error"; budgets: BudgetToday[] }> {
  const redis = getRedis();
  if (!redis) return { redis: "off", budgets: [] };
  const e = env();
  const day = Math.floor(now / DAY_MS);
  const openDota = openDotaBudget(e).perDay;
  const ai = e.DRAFT_AI_BUDGET_PER_DAY;
  const rows: Array<{ key: BudgetKey; counter: string; cap: number }> = [
    { key: "opendota", counter: `dd:budget:opendota:d:${day}`, cap: openDota },
    {
      key: "opendotaGuest",
      counter: `dd:budget:opendota:g:${day}`,
      cap: Math.floor(openDota * DEFAULT_GUEST_SHARE),
    },
    { key: "stratz", counter: `dd:budget:stratz:d:${day}`, cap: STRATZ_BUDGET.perDay },
    { key: "ai", counter: `dd:budget:llm:drafts:d:${day}`, cap: ai },
    {
      key: "aiGuest",
      counter: `dd:budget:llm:drafts-guest:d:${day}`,
      cap: Math.max(1, Math.floor(ai * GUEST_AI_SHARE)),
    },
  ];
  try {
    const values = await Promise.all(rows.map((r) => redis.get<string>(r.counter)));
    return {
      redis: "ok",
      budgets: rows.map((r, i) => ({ key: r.key, cap: r.cap, used: Number(values[i]) || 0 })),
    };
  } catch {
    return { redis: "error", budgets: [] };
  }
}
