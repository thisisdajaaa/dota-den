import "server-only";
import type { DataOwner } from "@/modules/shared/infrastructure/user-data";
import { getDb } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import { sharedGatewayOptions } from "@/modules/shared/infrastructure/shared-gateway-options";
import { PatchImportService } from "./application/patch-import-service";
import { PatchWatchlistService } from "./application/patch-watchlist-service";
import type { PatchQueries } from "./application/ports";
import type { PatchWatchlist } from "./domain/watchlist";
import {
  MongoPatchQueries,
  MongoPatchRefreshStateRepository,
  MongoPatchRepository,
  MongoPatchWatchlistRepository,
} from "./infrastructure/mongo-patch-repositories";
import { OpenDotaPatchReferenceCatalog } from "./infrastructure/opendota-reference-catalog";
import { ValvePatchAdapter } from "./infrastructure/valve-patch-adapter";
import * as userData from "./infrastructure/user-data";

// One gateway/catalog per server instance so dedup, caches and circuit state are shared.
const globalForPatches = globalThis as typeof globalThis & {
  __ddPatchGateways?: { valve: ProviderGateway; openDota: ProviderGateway };
  __ddPatchCatalog?: OpenDotaPatchReferenceCatalog;
};

function gateways(): { valve: ProviderGateway; openDota: ProviderGateway } {
  const make = (name: string) =>
    new ProviderGateway({
      name,
      ...sharedGatewayOptions("valve"),
      // Full patch payloads are ~200KB; allow a little longer than the default.
      timeoutMs: 15_000,
      onRequest: ({ url, status, durationMs, attempt }) =>
        logger.info("provider_request", {
          provider: name,
          path: new URL(url).pathname,
          status,
          durationMs,
          attempt,
        }),
    });
  globalForPatches.__ddPatchGateways ??= { valve: make("valve"), openDota: make("opendota") };
  return globalForPatches.__ddPatchGateways;
}

function referenceCatalog(): OpenDotaPatchReferenceCatalog {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  globalForPatches.__ddPatchCatalog ??= new OpenDotaPatchReferenceCatalog(gateways().openDota, {
    apiKey: OPENDOTA_API_KEY,
    baseUrl: OPENDOTA_BASE_URL,
  });
  return globalForPatches.__ddPatchCatalog;
}

export async function getPatchImportService(): Promise<PatchImportService> {
  const db = await getDb();
  return new PatchImportService({
    source: new ValvePatchAdapter(gateways().valve, { baseUrl: env().VALVE_DATAFEED_BASE_URL }),
    references: referenceCatalog(),
    patches: new MongoPatchRepository(db),
    refreshState: new MongoPatchRefreshStateRepository(db),
  });
}

export async function getPatchQueries(): Promise<PatchQueries> {
  return new MongoPatchQueries(await getDb());
}

export async function getPatchWatchlistService(): Promise<PatchWatchlistService> {
  return new PatchWatchlistService({
    watchlists: new MongoPatchWatchlistRepository(await getDb()),
  });
}

/** The user's watchlist (empty when they haven't saved one). */
export async function getWatchlist(userId: string): Promise<PatchWatchlist> {
  return (await getPatchWatchlistService()).get(userId);
}

/**
 * For pages: import the latest patches when none are stored or the last successful refresh
 * is over 24h old. Throttled across instances; never throws (logs and continues), so a
 * page can always render whatever is already stored.
 */
export async function ensurePatchesFresh(): Promise<void> {
  try {
    const service = await getPatchImportService();
    const started = Date.now();
    const res = await service.refreshIfStale();
    if (!res.ran) return;
    const durationMs = Date.now() - started;
    if (res.result.ok)
      logger.info("patch_refresh_completed", {
        trigger: "lazy",
        durationMs,
        outcomes: res.result.value,
      });
    else
      logger.warn("patch_refresh_failed", {
        trigger: "lazy",
        durationMs,
        reason: res.result.error.error.type,
      });
  } catch (e) {
    logger.error("patch_refresh_error", { trigger: "lazy", error: e });
  }
}

/** Your data in this part of the app, for "Download your data". */
export async function exportMyData(owner: DataOwner) {
  return userData.exportUserData(await getDb(), owner);
}

/** Deletes (or, where shared with others, anonymises) your data here. Returns counts. */
export async function deleteMyData(owner: DataOwner) {
  return userData.deleteUserData(await getDb(), owner);
}
