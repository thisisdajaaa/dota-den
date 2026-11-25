import "server-only";
import { env, openDotaBudget } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import { BUDGET_ALERT_SHARE, emitOpsSignal } from "@/common/ops/ops-signals";
import { cookies } from "next/headers";
import { getRedis } from "@/common/cache/redis";
import { SESSION_COOKIE } from "@/common/http/session-cookie";
import { markedLane } from "./background-work";
import type { GatewayOptions } from "./provider-gateway";
import { RedisResponseCache, RedisSharedCircuit, RedisUpstreamBudget } from "./redis-gateway-store";
import { SessionCheckMemo, type SessionVerifier } from "./session-lane";

let lastErrorLogAt = 0;

const globalForLane = globalThis as typeof globalThis & {
  __ddSessionVerifier?: SessionVerifier;
  __ddSessionMemo?: SessionCheckMemo;
};
const memo = (globalForLane.__ddSessionMemo ??= new SessionCheckMemo());
let warnedUnverified = false;

/**
 * How `lane()` checks a sign-in cookie. Shared code can't import the identity feature, so its
 * container registers this when it loads (it's loaded by every page and signed-in route).
 */
export function registerSessionVerifier(verify: SessionVerifier): void {
  globalForLane.__ddSessionVerifier = verify;
}

async function signedIn(token: string): Promise<boolean> {
  const verify = globalForLane.__ddSessionVerifier;
  if (!verify) {
    // Can't check the cookie: don't let an unchecked one claim the member budget.
    if (!warnedUnverified) logger.warn("session_verifier_missing", { lane: "guest" });
    warnedUnverified = true;
    return false;
  }
  try {
    return await memo.signedIn(token, verify);
  } catch (error) {
    // The session store is down: trust the cookie rather than starve signed-in players.
    logger.warn("session_lane_check_failed", { error });
    return true;
  }
}

/**
 * Who an upstream call is for. A call made for someone without a valid sign-in session is a
 * guest call: no cookie, or a cookie that matches no session (anyone can send a made-up one).
 * Sessions are checked against the database, remembered for a minute per token. Background
 * work (verified jobs, cron runs, which arrive as cookie-less requests) and calls outside a
 * request are member calls; work marked as guest traffic (preview images) is a guest call.
 */
export async function lane(): Promise<"guest" | "member"> {
  const marked = markedLane();
  if (marked) return marked;
  let token: string | undefined;
  try {
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    return "member";
  }
  if (!token) return "guest";
  return (await signedIn(token)) ? "member" : "guest";
}

/**
 * Global STRATZ calls across every instance (needs Redis). Far under the token's limits
 * (8/s, 150/min, 1,500/h, 15,000/day): the Meta page needs about one call per 6 hours.
 */
export const STRATZ_BUDGET = { perMinute: 20, perDay: 500 } as const;

function budgetFor(
  upstream: "opendota" | "valve" | "stratz",
  store: ConstructorParameters<typeof RedisUpstreamBudget>[0],
): GatewayOptions["budget"] {
  if (upstream === "valve") return undefined;
  const { perMinute, perDay } = upstream === "opendota" ? openDotaBudget(env()) : STRATZ_BUDGET;
  return new RedisUpstreamBudget(store, {
    prefix: `dd:budget:${upstream}`,
    perMinute,
    perDay,
    onExhausted: (window) => logger.warn(`${upstream}_budget_exhausted`, { window }),
    onMilestone: (usage) => {
      logger.info(`${upstream}_budget_usage`, usage);
      // Guests (mostly crawlers) use up their share most days; only the whole budget matters.
      if (usage.window === "day" && usage.used >= usage.cap * BUDGET_ALERT_SHARE)
        emitOpsSignal({ kind: "budget", budget: upstream, used: usage.used, cap: usage.cap });
    },
    lane,
  });
}

/** The circuit one gateway shares across instances; null without Redis. */
export function sharedCircuit(circuit: string): RedisSharedCircuit | null {
  const redis = getRedis();
  if (!redis) return null;
  const store = redis as unknown as ConstructorParameters<typeof RedisSharedCircuit>[0];
  return new RedisSharedCircuit(store, { prefix: `dd:circuit:${circuit}` });
}

/**
 * Shared cache, a shared circuit (and, for OpenDota and STRATZ, a global call budget) for a
 * gateway when Upstash Redis is configured (ADR 0008). Without Redis this returns nothing and
 * gateways stay per-instance. `circuit` names the gateway's circuit (default: the upstream):
 * a gateway with its own timeouts, like OpenDota's explorer, gets its own.
 */
export function sharedGatewayOptions(
  upstream: "opendota" | "valve" | "stratz",
  circuit: string = upstream,
): Pick<
  GatewayOptions,
  "sharedCache" | "budget" | "onSharedError" | "sharedCircuit" | "onCircuitOpen"
> {
  const redis = getRedis();
  if (!redis) return {};
  const store = redis as unknown as ConstructorParameters<typeof RedisResponseCache>[0];
  return {
    sharedCircuit: sharedCircuit(circuit) ?? undefined,
    onCircuitOpen: ({ openForMs, last }) =>
      logger.warn("provider_circuit_open", {
        provider: circuit,
        openForMs,
        failure: last.ok ? null : last.kind,
      }),
    sharedCache: new RedisResponseCache(store, { prefix: `dd:gw:${upstream}` }),
    // One budget per provider quota (OpenDota's API and explorer gateways share one).
    budget: budgetFor(upstream, store),
    onSharedError: ({ op, error }) => {
      // Fail open; log at most once a minute per instance.
      if (Date.now() - lastErrorLogAt < 60_000) return;
      lastErrorLogAt = Date.now();
      logger.warn("shared_gateway_store_unavailable", { upstream, op, error });
      emitOpsSignal({ kind: "store_down", store: "redis", op: `${upstream}:${op}` });
    },
  };
}
