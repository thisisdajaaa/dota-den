import "server-only";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

/**
 * Upstash Redis over HTTP (ADR 0008), or null when it isn't configured. One client per
 * instance. Values are stored as strings we serialize ourselves.
 */
const globalForRedis = globalThis as typeof globalThis & { __ddRedis?: Redis | null };

export function getRedis(): Redis | null {
  if (globalForRedis.__ddRedis !== undefined) return globalForRedis.__ddRedis;
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env();
  globalForRedis.__ddRedis =
    url && token
      ? new Redis({
          url,
          token,
          automaticDeserialization: false,
          enableTelemetry: false,
          // Callers fail open; don't stall a request on a slow Redis.
          retry: { retries: 1, backoff: () => 50 },
        })
      : null;
  return globalForRedis.__ddRedis;
}
