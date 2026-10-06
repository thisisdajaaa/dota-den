import "server-only";
import { env } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import { ProviderGateway } from "./provider-gateway";
import { sharedGatewayOptions } from "./shared-gateway-options";

export const OPENDOTA_DEFAULT_BASE_URL = "https://api.opendota.com/api";

/** Where OpenDota adapters send requests, and the optional API key. */
export interface OpenDotaConfig {
  baseUrl: string;
  apiKey?: string;
}

export function openDotaConfig(): OpenDotaConfig {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  return { baseUrl: OPENDOTA_BASE_URL ?? OPENDOTA_DEFAULT_BASE_URL, apiKey: OPENDOTA_API_KEY };
}

// One gateway per server instance so dedup, cache and circuit state are shared.
const globalForGateway = globalThis as typeof globalThis & { __ddOpenDota?: ProviderGateway };

/** Shared OpenDota gateway (one per instance: shared cache, dedup and circuit state). */
export function openDotaGateway(): ProviderGateway {
  const { OPENDOTA_TIMEOUT_MS, OPENDOTA_MAX_RETRIES } = env();
  globalForGateway.__ddOpenDota ??= new ProviderGateway({
    name: "opendota",
    ...sharedGatewayOptions("opendota"),
    timeoutMs: OPENDOTA_TIMEOUT_MS,
    maxRetries: OPENDOTA_MAX_RETRIES,
    onRequest: ({ url, status, durationMs, attempt }) =>
      logger.info("provider_request", {
        provider: "opendota",
        path: new URL(url).pathname,
        status,
        durationMs,
        attempt,
      }),
  });
  return globalForGateway.__ddOpenDota;
}

const globalForExplorer = globalThis as typeof globalThis & { __ddExplorer?: ProviderGateway };

/**
 * OpenDota's SQL explorer (pro database): slow (some queries take ~12s) and sometimes down.
 * Its own gateway has a long timeout and a separate circuit, so explorer trouble never trips
 * the circuit for the rest of the OpenDota API. Shared by every feature that queries it.
 */
export function openDotaExplorerGateway(): ProviderGateway {
  const { OPENDOTA_EXPLORER_TIMEOUT_MS, OPENDOTA_EXPLORER_MAX_RETRIES } = env();
  globalForExplorer.__ddExplorer ??= new ProviderGateway({
    name: "opendota-explorer",
    ...sharedGatewayOptions("opendota"),
    timeoutMs: OPENDOTA_EXPLORER_TIMEOUT_MS,
    maxRetries: OPENDOTA_EXPLORER_MAX_RETRIES,
    onRequest: ({ status, durationMs, attempt }) =>
      logger.info("provider_request", {
        provider: "opendota-explorer",
        path: "/api/explorer",
        status,
        durationMs,
        attempt,
      }),
  });
  return globalForExplorer.__ddExplorer;
}
