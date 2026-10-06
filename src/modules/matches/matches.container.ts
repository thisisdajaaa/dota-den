import "server-only";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { lazy } from "@/common/utils/lazy";
import { errorsService } from "@/modules/errors";
import { jobsService } from "@/modules/jobs";
import { OpenDotaAdapter } from "./infrastructure/opendota-adapter";
import { MatchesController } from "./matches.controller";
import {
  MatchFactsRepository,
  MatchReadRepository,
  SyncStatesRepository,
} from "./repositories/matches.repository";
import { MatchSyncService } from "./services/match-sync.service";
import { MatchesService } from "./services/matches.service";

export const matchFactsRepository = new MatchFactsRepository(getDb);
export const syncStatesRepository = new SyncStatesRepository(getDb);
/** The matches query port (dashboard facts, ranked results, lists): read by many features. */
export const matchQueries = new MatchReadRepository(getDb);

/** The shared OpenDota adapter (one gateway: shared cache, dedup and circuit breaker). */
export const openDotaAdapter = lazy(() => new OpenDotaAdapter(openDotaGateway(), openDotaConfig()));

export const matchSyncService = new MatchSyncService({
  provider: openDotaAdapter,
  patches: openDotaAdapter,
  facts: matchFactsRepository,
  syncState: syncStatesRepository,
});

export const matchesService = new MatchesService({
  openDota: openDotaAdapter,
  store: matchQueries,
  logger,
});

export const matchesController = new MatchesController({
  sync: matchSyncService,
  matches: matchesService,
  continueBackfill: (accountId32) => jobsService.enqueueMatchBackfill(accountId32),
  reportError: ({ message, path }) =>
    errorsService.record({ source: "server", kind: "sync", message, path }),
  logger,
});
