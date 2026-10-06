import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { ProviderGateway } from "@/common/providers/provider-gateway";
import { sharedGatewayOptions } from "@/common/providers/shared-gateway-options";
import { lazy } from "@/common/utils/lazy";
import { matchQueries } from "@/modules/matches";
import { OpenDotaPatchReferenceCatalog } from "./infrastructure/opendota-reference-catalog";
import { ValvePatchAdapter } from "./infrastructure/valve-patch-adapter";
import { PatchesController } from "./patches.controller";
import {
  PatchReadRepository,
  PatchRefreshStateRepository,
  PatchesRepository,
  PatchWatchlistsRepository,
} from "./repositories/patches.repository";
import { PatchImportService } from "./services/patch-import.service";
import { PatchWatchlistService } from "./services/patch-watchlist.service";
import { PatchesService } from "./services/patches.service";

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

export const patchesRepository = new PatchesRepository(getDb);
export const patchReadRepository = new PatchReadRepository(getDb);
export const patchWatchlistsRepository = new PatchWatchlistsRepository(getDb);
const refreshState = new PatchRefreshStateRepository(getDb);

export const patchImportService = lazy(
  () =>
    new PatchImportService({
      source: new ValvePatchAdapter(gateways().valve, { baseUrl: env().VALVE_DATAFEED_BASE_URL }),
      references: referenceCatalog(),
      patches: patchesRepository,
      refreshState,
    }),
);

export const patchWatchlistService = new PatchWatchlistService({
  watchlists: patchWatchlistsRepository,
  data: patchWatchlistsRepository,
});

export const patchesService = new PatchesService({
  queries: patchReadRepository,
  importer: () => patchImportService,
  watchlists: patchWatchlistService,
  ranked: {
    rankedResults: async (id, range) => matchQueries.rankedResults(id, range),
  },
  logger,
});

export const patchesController = new PatchesController({
  patches: patchesService,
  watchlists: patchWatchlistService,
  importer: () => patchImportService,
  logger,
});
