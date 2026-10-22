import "server-only";
import { env, openDotaBudget } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import { cookies } from "next/headers";
import { getRedis } from "@/common/cache/redis";
import { SESSION_COOKIE } from "@/common/http/session-cookie";
import { markedLane } from "./background-work";
import type { GatewayOptions } from "./provider-gateway";
import { RedisResponseCache, RedisUpstreamBudget } from "./redis-gateway-store";
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
 * Shared cache (and, for OpenDota, the global call budget) for a gateway when Upstash Redis
 * is configured (ADR 0008). Without Redis this returns nothing and gateways stay per-instance.
 */
export function sharedGatewayOptions(
  upstream: "opendota" | "valve",
): Pick<GatewayOptions, "sharedCache" | "budget" | "onSharedError"> {
  const redis = getRedis();
  if (!redis) return {};
  const store = redis as unknown as ConstructorParameters<typeof RedisResponseCache>[0];
  const { perMinute, perDay } = openDotaBudget(env());
  return {
    sharedCache: new RedisResponseCache(store, { prefix: `dd:gw:${upstream}` }),
    // One budget for every OpenDota gateway (API and explorer): it's one provider quota.
    budget:
      upstream === "opendota"
        ? new RedisUpstreamBudget(store, {
            prefix: "dd:budget:opendota",
            perMinute,
            perDay,
            onExhausted: (window) => logger.warn("opendota_budget_exhausted", { window }),
            onMilestone: (usage) => logger.info("opendota_budget_usage", usage),
            lane,
          })
        : undefined,
    onSharedError: ({ op, error }) => {
      // Fail open; log at most once a minute per instance.
      if (Date.now() - lastErrorLogAt < 60_000) return;
      lastErrorLogAt = Date.now();
      logger.warn("shared_gateway_store_unavailable", { upstream, op, error });
    },
  };
}
