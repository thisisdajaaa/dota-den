import "server-only";
import { getDb } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import { MatchSyncService } from "./application/match-sync-service";
import type { MatchQueries } from "./application/ports";
import { OpenDotaAdapter } from "./infrastructure/opendota-adapter";
import {
  MongoMatchQueries,
  MongoPlayerMatchFactRepository,
  MongoSyncStateRepository,
} from "./infrastructure/mongo-match-repositories";

// One gateway per server instance so dedup, cache and circuit state are shared.
const globalForGateway = globalThis as typeof globalThis & { __ddOpenDota?: ProviderGateway };

function openDotaGateway(): ProviderGateway {
  globalForGateway.__ddOpenDota ??= new ProviderGateway({
    name: "opendota",
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

export function getOpenDotaAdapter(): OpenDotaAdapter {
  return new OpenDotaAdapter(openDotaGateway(), { apiKey: env().OPENDOTA_API_KEY });
}

export async function getMatchSyncService(): Promise<MatchSyncService> {
  const db = await getDb();
  const openDota = getOpenDotaAdapter();
  return new MatchSyncService({
    provider: openDota,
    patches: openDota,
    facts: new MongoPlayerMatchFactRepository(db),
    syncState: new MongoSyncStateRepository(db),
  });
}

export async function getMatchQueries(): Promise<MatchQueries> {
  return new MongoMatchQueries(await getDb());
}
