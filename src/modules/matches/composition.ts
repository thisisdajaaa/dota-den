import "server-only";
import { getDb } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import { MatchSyncService } from "./application/match-sync-service";
import type { HeroInfo, ItemInfo, MatchQueries, PlayerProfileSnapshot } from "./application/ports";
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
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  return new OpenDotaAdapter(openDotaGateway(), {
    apiKey: OPENDOTA_API_KEY,
    baseUrl: OPENDOTA_BASE_URL,
  });
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

/** Public profile (persona, avatar, rank). Tolerates upstream failure: returns null. */
export async function getPlayerProfile(accountId32: number): Promise<PlayerProfileSnapshot | null> {
  const res = await getOpenDotaAdapter().fetchPlayerProfile(accountId32);
  if (!res.ok) logger.warn("profile_unavailable", { accountId32, reason: res.error.type });
  return res.ok ? res.value : null;
}

/** Hero lookup by id. Empty map if the catalog is unavailable (UI falls back to "Hero #id"). */
export async function getHeroMap(): Promise<Map<number, HeroInfo>> {
  const res = await getOpenDotaAdapter().getHeroes();
  if (!res.ok) logger.warn("hero_catalog_unavailable", { reason: res.error.type });
  return new Map((res.ok ? res.value : []).map((h) => [h.id, h]));
}

/** Item lookup by id. Empty map if unavailable (UI shows an empty slot with the id). */
export async function getItemMap(): Promise<Map<number, ItemInfo>> {
  const res = await getOpenDotaAdapter().getItems();
  if (!res.ok) logger.warn("item_catalog_unavailable", { reason: res.error.type });
  return new Map((res.ok ? res.value : []).map((i) => [i.id, i]));
}
