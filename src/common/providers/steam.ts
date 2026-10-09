import "server-only";
import { env } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import { ProviderGateway } from "./provider-gateway";

export const STEAM_API_DEFAULT_BASE_URL = "https://api.steampowered.com";

/** Where Steam Web API adapters send requests, and the key (sent as the `key` parameter). */
export interface SteamWebApiConfig {
  baseUrl: string;
  apiKey: string;
}

/** Null when STEAM_WEB_API_KEY is unset: features that need Steam stay off. */
export function steamWebApiConfig(): SteamWebApiConfig | null {
  const { STEAM_WEB_API_KEY, STEAM_API_BASE_URL } = env();
  if (!STEAM_WEB_API_KEY) return null;
  return { baseUrl: STEAM_API_BASE_URL ?? STEAM_API_DEFAULT_BASE_URL, apiKey: STEAM_WEB_API_KEY };
}

// One gateway per server instance so dedup, cache and circuit state are shared.
const globalForGateway = globalThis as typeof globalThis & { __ddSteam?: ProviderGateway };

/**
 * Shared Steam Web API gateway. No shared (Redis) cache: the key travels in the query string,
 * which is the cache key, and Steam's presence is only cached for a minute anyway. Logs record
 * paths only, never the key.
 */
export function steamGateway(): ProviderGateway {
  globalForGateway.__ddSteam ??= new ProviderGateway({
    name: "steam",
    timeoutMs: 6_000,
    maxRetries: 1,
    onRequest: ({ url, status, durationMs, attempt }) =>
      logger.info("provider_request", {
        provider: "steam",
        path: new URL(url).pathname,
        status,
        durationMs,
        attempt,
      }),
  });
  return globalForGateway.__ddSteam;
}
