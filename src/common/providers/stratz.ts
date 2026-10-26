import "server-only";
import { env } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import { ProviderGateway } from "./provider-gateway";
import { sharedGatewayOptions } from "./shared-gateway-options";
import { StratzHeroCurves } from "./stratz-hero-curves";
import { StratzHeroItems } from "./stratz-hero-items";
import { StratzHeroMatchups } from "./stratz-hero-matchups";

export const STRATZ_DEFAULT_BASE_URL = "https://api.stratz.com";

/** Where the STRATZ GraphQL API is (`<baseUrl>/graphql`), and the bearer token. */
export interface StratzConfig {
  baseUrl: string;
  token: string;
}

/** Null when STRATZ_API_TOKEN is unset: features that use STRATZ fall back to OpenDota. */
export function stratzConfig(): StratzConfig | null {
  const { STRATZ_API_TOKEN, STRATZ_API_BASE_URL } = env();
  if (!STRATZ_API_TOKEN) return null;
  return { baseUrl: STRATZ_API_BASE_URL ?? STRATZ_DEFAULT_BASE_URL, token: STRATZ_API_TOKEN };
}

const globalForGateway = globalThis as typeof globalThis & {
  __ddStratz?: ProviderGateway;
  __ddStratzMatchups?: StratzHeroMatchups;
  __ddStratzItems?: StratzHeroItems;
  __ddStratzCurves?: StratzHeroCurves;
};

/**
 * Shared STRATZ gateway: its own circuit, so STRATZ trouble never trips OpenDota's, and its own
 * shared cache and budget. The token travels in a header, never in the cache key or the logs.
 */
export function stratzGateway(): ProviderGateway {
  globalForGateway.__ddStratz ??= new ProviderGateway({
    name: "stratz",
    ...sharedGatewayOptions("stratz"),
    timeoutMs: 10_000,
    maxRetries: 1,
    // Fewer failures open the circuit, for longer: one query serves the whole Meta page.
    failureThreshold: 3,
    openForMs: 5 * 60_000,
    onStale: ({ failure, ageMs }) =>
      logger.warn("provider_stale_served", {
        provider: "stratz",
        path: "/graphql",
        failure,
        ageMs,
      }),
    onRequest: ({ status, durationMs, attempt }) =>
      logger.info("provider_request", {
        provider: "stratz",
        path: "/graphql",
        status,
        durationMs,
        attempt,
      }),
  });
  return globalForGateway.__ddStratz;
}

/** Shared STRATZ hero matchups (one parsed copy per instance), or null without a token. */
export function stratzHeroMatchups(): StratzHeroMatchups | null {
  const config = stratzConfig();
  if (!config) return null;
  globalForGateway.__ddStratzMatchups ??= new StratzHeroMatchups(stratzGateway(), config);
  return globalForGateway.__ddStratzMatchups;
}

/** Shared STRATZ item builds per hero (parsed copies per instance), or null without a token. */
export function stratzHeroItems(): StratzHeroItems | null {
  const config = stratzConfig();
  if (!config) return null;
  globalForGateway.__ddStratzItems ??= new StratzHeroItems(stratzGateway(), config);
  return globalForGateway.__ddStratzItems;
}

/** Shared STRATZ per-minute averages per hero and rank (parsed copies per instance), or null. */
export function stratzHeroCurves(): StratzHeroCurves | null {
  const config = stratzConfig();
  if (!config) return null;
  globalForGateway.__ddStratzCurves ??= new StratzHeroCurves(stratzGateway(), config);
  return globalForGateway.__ddStratzCurves;
}
