import "server-only";
import { env, openDotaBudget } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
import type { GatewayOptions } from "./provider-gateway";
import { RedisResponseCache, RedisUpstreamBudget } from "./redis-gateway-store";

let lastErrorLogAt = 0;

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
