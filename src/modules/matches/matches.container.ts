import "server-only";
import { after } from "next/server";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { lazy } from "@/common/utils/lazy";
import { discordFeedService } from "@/modules/discord";
import { errorsService } from "@/modules/errors";
import { isNotableItem } from "@/modules/heroes/domain/hero-stats";
import { jobsService } from "@/modules/jobs";
import { OpenDotaAdapter } from "./infrastructure/opendota-adapter";
import { MatchesController } from "./matches.controller";
import {
  MatchFactsRepository,
  MatchReadRepository,
  SyncStatesRepository,
} from "./repositories/matches.repository";
import { MatchExtrasRepository } from "./repositories/match-extras.repository";
import { MatchExtrasService } from "./services/match-extras.service";
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

export const matchExtrasRepository = new MatchExtrasRepository(getDb);

/** Item timings and lanes from your parsed games, a few match details per day. */
export const matchExtrasService = new MatchExtrasService({
  store: matchExtrasRepository,
  provider: openDotaAdapter,
  completedItems: async () => {
    const res = await openDotaAdapter.getItems();
    if (!res.ok) return null;
    const completed = new Set(res.value.filter(isNotableItem).map((i) => i.key));
    return (key) => completed.has(key);
  },
  logger,
});

export const matchesController = new MatchesController({
  sync: matchSyncService,
  matches: matchesService,
  continueBackfill: (accountId32) => jobsService.enqueueMatchBackfill(accountId32),
  reportError: ({ message, path }) =>
    errorsService.record({ source: "server", kind: "sync", message, path }),
  // Post the new games to the player's Discord feed (if they set one up) after the response.
  onNewMatches: (accountId32) =>
    after(() =>
      discordFeedService
        .postNewFor(accountId32)
        .then((result) => {
          if (result.outcome !== "off")
            logger.info("discord_feed_posted", { accountId32, ...result });
        })
        .catch((error: unknown) => logger.warn("discord_feed_failed", { accountId32, error })),
    ),
  // A few match details for the hero coaching extras, within the daily cap, after the response.
  onSynced: (accountId32) =>
    after(() =>
      matchExtrasService
        .backfill(accountId32)
        .then((run) => {
          if (run.fetched > 0) logger.info("match_extras_filled", { accountId32, ...run });
        })
        .catch((error: unknown) => logger.warn("match_extras_failed", { accountId32, error })),
    ),
  logger,
});
