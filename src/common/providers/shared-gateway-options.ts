import "server-only";
import { env, openDotaBudget } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import { cookies } from "next/headers";
import { getRedis } from "@/common/cache/redis";
import { SESSION_COOKIE } from "@/common/http/session-cookie";
import type { GatewayOptions } from "./provider-gateway";
import { RedisResponseCache, RedisUpstreamBudget } from "./redis-gateway-store";

let lastErrorLogAt = 0;

/**
 * A call made while rendering a page for someone without a sign-in cookie is a guest call.
 * Outside a request (cron, background jobs) there are no cookies: those are member calls.
 * Only the cookie's presence is checked; that's enough to tell crawlers from players.
 */
async function lane(): Promise<"guest" | "member"> {
  try {
    return (await cookies()).has(SESSION_COOKIE) ? "member" : "guest";
  } catch {
    return "member";
  }
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
